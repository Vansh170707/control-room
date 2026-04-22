import sys

target = "src/App.tsx"
replacement_file = "new_layout.tsx"

with open(target, 'r') as f:
    lines = f.readlines()

with open(replacement_file, 'r') as f:
    replacement = f.read()

# Lines are 1-indexed. Line 2270 is index 2269. Line 3564 is index 3563.
new_lines = lines[:2269] + [replacement + '\n'] + lines[3564:]

with open(target, 'w') as f:
    f.writelines(new_lines)

print("Replaced lines successfully.")
