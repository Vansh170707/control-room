# 🌌 Control Room: Your Personal AI Operating System

![License](https://img.shields.io/github/license/Vansh170707/control-room)
![Stars](https://img.shields.io/github/stars/Vansh170707/control-room)
![Issues](https://img.shields.io/github/issues/Vansh170707/control-room)

**Control Room** is a sophisticated, high-performance multi-agent orchestration workspace designed to act as a bridge between complex AI models and actionable system execution. It transforms the experience of interacting with LLMs from a simple chat into a full-scale command center.

---

## 🚀 The Vision
Imagine an OS where AI agents aren't just chatbots, but active operators. **Control Room** provides the infrastructure for agents to communicate, delegate tasks, maintain persistent memory, and execute code in a secure, sandboxed environment—all managed through a sleek, futuristic interface.

## ✨ Key Capabilities

### 🧠 Advanced Orchestration
*   **Agent Delegation:** Agents can spawn sub-agents to handle specialized tasks, creating a hierarchical workflow for complex problem solving.
*   **Contextual Threads:** Maintain deep, persistent conversations across different agent personas with seamless history tracking.
*   **Multi-Model Integration:** Unified interface for the world's most powerful models (OpenAI, Anthropic, Gemini) with a single runtime.

### 💻 Secure Execution
*   **Sandboxed Terminal:** A built-in guarded terminal that allows agents to run commands and execute logic safely.
*   **Real-time Feedback:** Watch as agents iterate on code, run tests, and refine outputs in a live environment.

### ☁️ Cloud Persistence
*   **Supabase Integration:** Fully integrated backend for real-time synchronization of agent states, thread histories, and configuration.
*   **State Management:** Leveraging Zustand for lightning-fast UI updates and consistent application state.

---

## 🛠️ Technical Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | `React 18` + `TypeScript` | Type-safe, component-based UI |
| **Styling** | `Tailwind CSS` + `Framer Motion` | Modern, fluid, and responsive design |
| **UI Components** | `Radix UI` + `Lucide React` | Accessible and professional primitives |
| **State** | `Zustand` | Lightweight, scalable state management |
| **Backend** | `Node.js` + `Supabase` | Database persistence & Auth |
| **Build Tool** | `Vite` | Ultra-fast development and bundling |

---

## ⚙️ Quick Start

### Prerequisites
* Node.js (v18+)
* A Supabase Project
* API Keys for your preferred LLM providers

### Installation
1. **Clone the repository:**
   ```bash
   git clone https://github.com/Vansh170707/control-room.git
   cd control-room
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment:**
   Create a `.env` file in the root directory and add your keys:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_AGENT_RUNTIME_URL=your_runtime_server_url
   ```

4. **Launch the Control Room:**
   ```bash
   npm run dev
   ```

---

## 🗺️ Roadmap
- [ ] **Custom Tool Integration:** Allow users to define their own API tools for agents.
- [ ] **Voice Interface:** Integration with Whisper and ElevenLabs for a true "Jarvis" experience.
- [ ] **Collaborative Rooms:** Multi-user workspaces for team-based agent orchestration.

---

Developed with ❤️ by [Vansh Sehrawat](https://github.com/Vansh170707)
