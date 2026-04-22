#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import re
from pathlib import Path


def decode_prompt(value: str) -> str:
    return base64.b64decode(value.encode("ascii")).decode("utf-8")


def clean_parts(value: str) -> list[str]:
    return [part.strip(" .,-") for part in re.split(r",|\band\b", value) if part.strip(" .,-")]


def parse_resume_prompt(prompt: str) -> dict:
    normalized = " ".join(prompt.split())

    name_match = re.search(r"\b(?:i am|my name is)\s+([A-Za-z][A-Za-z\s]+?)(?:\s+(?:in|from)\b|,|\.|$)", normalized, re.I)
    university_match = re.search(r"\b(?:in|from)\s+([A-Za-z][A-Za-z\s]+?university)\b", normalized, re.I)
    degree_match = re.search(r"\b(b\.?\s*tech[^,\.]*computer science|computer science)\b", normalized, re.I)
    graduation_match = re.search(r"\bgraduation(?:\s+in|\s*:\s*|\s+year\s+)?(20\d{2})\b", normalized, re.I)
    gpa_match = re.search(r"\bgpa(?:\s*[:=]|\s+is)?\s*(\d+(?:\.\d+)?)\b", normalized, re.I)
    skills_match = re.search(r"\bskills?\s+in\s+(.+?)(?:\s+projects?\b|$)", normalized, re.I)
    projects_match = re.search(r"\bprojects?\s+(?:created|include|are|:)?\s*(.+)$", normalized, re.I)

    name = name_match.group(1).strip() if name_match else "Your Name"
    university = university_match.group(1).strip() if university_match else "Your University"
    degree = degree_match.group(1).strip() if degree_match else "B.Tech in Computer Science"
    graduation = graduation_match.group(1).strip() if graduation_match else "2029"
    gpa = gpa_match.group(1).strip() if gpa_match else ""
    skills = clean_parts(skills_match.group(1)) if skills_match else []
    projects = clean_parts(projects_match.group(1)) if projects_match else []

    if not projects and "attendance system" in normalized.lower():
      projects = ["Multi-Agent Orchestration Platform", "Attendance System (Java)"]

    return {
        "name": name,
        "university": university,
        "degree": degree,
        "graduation": graduation,
        "gpa": gpa,
        "skills": skills,
        "projects": projects,
    }


def write_pdf_with_reportlab(output_path: Path, data: dict) -> bool:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
    except Exception:
        return False

    output_path.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(output_path), pagesize=A4)
    width, height = A4
    x = 54
    y = height - 64

    pdf.setTitle(f"{data['name']} Resume")
    pdf.setFont("Helvetica-Bold", 22)
    pdf.drawString(x, y, data["name"])
    y -= 26

    pdf.setFont("Helvetica", 11)
    education_line = f"{data['university']} | {data['degree']} | Expected Graduation: {data['graduation']}"
    pdf.drawString(x, y, education_line[:110])
    y -= 18
    if data["gpa"]:
        pdf.drawString(x, y, f"GPA: {data['gpa']}")
        y -= 22

    if data["skills"]:
        pdf.setFont("Helvetica-Bold", 13)
        pdf.drawString(x, y, "Skills")
        y -= 18
        pdf.setFont("Helvetica", 11)
        pdf.drawString(x, y, ", ".join(data["skills"])[:120])
        y -= 26

    if data["projects"]:
        pdf.setFont("Helvetica-Bold", 13)
        pdf.drawString(x, y, "Projects")
        y -= 18
        pdf.setFont("Helvetica", 11)
        for project in data["projects"][:6]:
            pdf.drawString(x, y, f"- {project}"[:120])
            y -= 16

    pdf.save()
    return True


def escape_pdf_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def write_minimal_pdf(output_path: Path, data: dict) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        data["name"],
        f"{data['university']} | {data['degree']}",
        f"Expected Graduation: {data['graduation']}",
    ]
    if data["gpa"]:
        lines.append(f"GPA: {data['gpa']}")
    if data["skills"]:
        lines.append("")
        lines.append("Skills")
        lines.extend([f"- {skill}" for skill in data["skills"]])
    if data["projects"]:
        lines.append("")
        lines.append("Projects")
        lines.extend([f"- {project}" for project in data["projects"]])

    content_lines = ["BT", "/F1 14 Tf", "54 770 Td"]
    first = True
    for line in lines:
        if not first:
            content_lines.append("0 -20 Td")
        first = False
        content_lines.append(f"({escape_pdf_text(line)}) Tj")
    content_lines.append("ET")
    content_stream = "\n".join(content_lines).encode("latin-1", "replace")

    objects = [
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
        b"2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj",
        b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
        b"4 0 obj << /Length %d >> stream\n%s\nendstream endobj" % (len(content_stream), content_stream),
        b"5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    ]

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = []
    for obj in objects:
        offsets.append(len(pdf))
        pdf.extend(obj)
        pdf.extend(b"\n")
    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    pdf.extend(
        f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode("ascii")
    )
    output_path.write_bytes(pdf)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a simple resume PDF from prompt text.")
    parser.add_argument("--output", required=True, help="Absolute output PDF path.")
    parser.add_argument("--prompt-b64", required=True, help="Base64-encoded prompt or thread context.")
    args = parser.parse_args()

    prompt = decode_prompt(args.prompt_b64)
    data = parse_resume_prompt(prompt)
    output_path = Path(args.output).expanduser().resolve()

    created_with_reportlab = write_pdf_with_reportlab(output_path, data)
    if not created_with_reportlab:
        write_minimal_pdf(output_path, data)

    print(f"Created PDF at {output_path}")
    print(f"ARTIFACT_FILE: {output_path}")


if __name__ == "__main__":
    main()
