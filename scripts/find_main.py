import sys

def find_main():
    with open('src/App.tsx', 'r', encoding='utf-8') as f:
        lines = f.readlines()

    start_idx = -1
    end_idx = -1
    
    # We are looking for the <main> tag that wraps the chat layout
    for i, line in enumerate(lines):
        if '<main' in line and 'flex-1' in line:
            if start_idx == -1:
                start_idx = i
        elif '</main>' in line:
            if start_idx != -1 and end_idx == -1:
                end_idx = i

    if start_idx == -1 or end_idx == -1:
        print(f"Error: Could not find main boundaries. Start: {start_idx}, End: {end_idx}")
        sys.exit(1)
        
    print(f"Main Bounds: {start_idx} to {end_idx}")
    print("Start Line:", lines[start_idx].strip())
    print("End Line:", lines[end_idx].strip())

if __name__ == "__main__":
    find_main()
