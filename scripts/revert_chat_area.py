import sys

def restore_chat_area():
    with open('src/components/chat/ChatArea.tsx', 'r', encoding='utf-8') as f:
        chat_lines = f.readlines()

    # Get the raw JSX payload from chat area (ignoring the wrapper I built)
    start_jsx = -1
    end_jsx = -1
    for i, line in enumerate(chat_lines):
        if '<main' in line and 'flex-1' in line:
            start_jsx = i
        elif '</main>' in line:
            end_jsx = i

    if start_jsx == -1 or end_jsx == -1:
        print("Error reading original Chat JSX.")
        sys.exit(1)

    jsx_payload = chat_lines[start_jsx:end_jsx + 1]

    with open('src/App.tsx', 'r', encoding='utf-8') as f:
        app_lines = f.readlines()

    app_start = -1
    app_end = -1
    for i, line in enumerate(app_lines):
        if '<ChatArea legacyProps={{' in line:
            app_start = i
            # Look for the closing tags of the legacyProp blob
            for j in range(i, len(app_lines)):
                if '}} />' in app_lines[j]:
                    app_end = j
                    break
            break

    if app_start == -1 or app_end == -1:
        print("Error locating ChatArea bounds in App.tsx")
        sys.exit(1)

    restored_lines = app_lines[:app_start] + jsx_payload + app_lines[app_end + 1:]

    # Remove the import ChatArea statement
    final_lines = [line for line in restored_lines if 'import { ChatArea }' not in line]

    with open('src/App.tsx', 'w', encoding='utf-8') as f:
        f.writelines(final_lines)

    print("Restored successfully!")

if __name__ == "__main__":
    restore_chat_area()
