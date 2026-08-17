# Nulltor Quick Start Guide

Welcome to Nulltor! This guide will help any new developer pull the repository and get the entire collaborative IDE running locally on their machine in a few simple steps.

## Prerequisites

To ensure a smooth setup, you will need the following installed on your machine:
- **Git** (to clone/pull the repository)
- **Docker Desktop** *(Recommended for the universal development setup)*
- **OR** **Node.js (v18+)** and **Python (3.10+)** *(If you prefer to run it natively without Docker)*

---

## Step 1: Clone the Repository

If you haven't already, clone the repository to your local machine:
```bash
git clone <repository-url>
cd nulltor-main
```

## Step 2: Set Up Environment Variables (Required)

Nulltor requires API keys to operate the autonomous AI Agent. You must configure your environment variables before starting the server, otherwise the backend will crash on startup.

1. Locate the `.env.example` file in the root directory.
2. Copy it to a new file named exactly `.env`.
   - **Windows (Command Prompt):** `copy .env.example .env`
   - **Mac/Linux:** `cp .env.example .env`
3. Open the `.env` file in any text editor and fill in your API credentials (e.g., your Together AI, OpenAI, or Groq API keys).

---

## Step 3: Run the Application

You have two options for running the Nulltor platform. Choose the one that best fits your workflow.

### Option A: Universal Docker Setup (Recommended)
This method is highly recommended. It runs perfectly on Windows, Mac, and Linux without requiring you to install Python or worry about missing OS dependencies. It also supports **Hot-Reloading**, meaning if you edit the source code locally, the changes instantly reflect inside the containers without needing to rebuild them!

1. Ensure **Docker Desktop** is open and running in the background.
2. In your terminal, run the following single command:
   ```bash
   npm run docker:dev
   ```
3. Docker will build and spin up the Unified Gateway, FastAPI backend, and PostgreSQL database. 
4. Once you see the "READY" message, open your browser and go to: **`http://localhost:3330`**

### Option B: Native Local Setup (No Docker)
If you prefer running the servers natively on your host machine, you can use the built-in NPM orchestration script.

1. Install all Node.js dependencies:
   ```bash
   npm install
   ```
2. Start the unified backend and gateway:
   ```bash
   npm start
   ```
3. The script will automatically start both the Node server and the Python FastAPI backend.
4. Open your browser and go to: **`http://localhost:3330`**

---

## Troubleshooting

- **"The model does not exist" / AI Errors:** Make sure your `.env` file is properly configured and that you have valid API credits for the model defined in your environment file.
- **Microphone / Camera not working:** Ensure you are accessing the IDE via `http://localhost:3330`. Modern browsers require either `localhost` or a secure `https://` connection to grant camera and microphone permissions.
- **Port already in use (3330, 3000, 8001):** Run `npm stop` to forcefully clear any lingering background processes that might be occupying the ports, then try starting again.
