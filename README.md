# CareerPilot AI 🚀

An AI-powered resume analyzer that helps you land more interviews.

## Live Demo
🔗 [Add your Vercel URL here]

## Features
- 📊 ATS Score — see how well your resume matches a job
- ❌ Missing Skills — find what keywords you're lacking
- ✨ Resume Editor — AI rewrites your resume for the job
- ✉️ Cover Letter Generator — tailored cover letter in one click
- 📈 History — track your score improvements over time
- ⬇️ PDF Export — download your full analysis report

## Tech Stack
- **Frontend:** React, Vite
- **Backend:** Flask, Python
- **AI:** Google Gemini 2.5 Flash
- **Deployment:** Vercel (frontend), Render (backend)

## Run Locally

### Backend
```bash
cd backend
pip install -r requirements.txt
python app.py
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Environment Variables
Create a `.env` file in the backend folder:
```
GEMINI_API_KEY=your_key_here
```
