from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
import google.generativeai as genai
import os
import pdfplumber
import io
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from scoring_engine import compute_match_score

load_dotenv()

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-2.5-flash")

app = FastAPI(title="CareerPilot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic models ────────────────────────────────────────────────────────────
class AnalyzeRequest(BaseModel):
    resume_text: str
    job: str

class ExportRequest(BaseModel):
    analysis: str = ""
    cover_letter: str = ""
    score: str = "N/A"


# ── Helpers ────────────────────────────────────────────────────────────────────
def extract_pdf_text(file_bytes: bytes) -> str:
    text = ""
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    return text.strip()


def build_analysis_prompt(resume_text: str, job: str) -> str:
    return f"""
You are an expert ATS (Applicant Tracking System) and career coach. Analyze the resume below against the job description.

Resume:
{resume_text}

Job Description:
{job}

Respond in this exact markdown format:

## ATS Score
**Score: [0-100]/100**
[One sentence explaining the score.]

## Match Summary
[2-3 sentences summarizing how well the candidate fits.]

## Matching Skills
- [skill 1]
- [skill 2]

## Missing Skills
- [skill 1]
- [skill 2]

## Suggestions
1. [Actionable suggestion 1]
2. [Actionable suggestion 2]
3. [Actionable suggestion 3]

## Recommended Resume Tweaks
- [Specific tweak 1]
- [Specific tweak 2]
- [Specific tweak 3]

## Top Keywords to Add
[comma-separated list of 8-12 important keywords from the job description missing in resume]
""".strip()


def build_cover_letter_prompt(resume_text: str, job: str) -> str:
    return f"""
You are an expert career coach and professional writer.

Write a compelling, personalized cover letter based on the resume and job description below.

Resume:
{resume_text}

Job Description:
{job}

Guidelines:
- 3-4 paragraphs, professional but warm tone
- Opening: hook that mentions the role and a key strength
- Middle: 2 specific achievements from the resume mapped to job needs
- Closing: confident call to action
- Do NOT use placeholders like [Company Name] - infer or use "your team"
- Do NOT write "Dear Hiring Manager" - start directly with a strong opening line
- Length: 250-320 words
- Return ONLY the cover letter text, no labels or headers
""".strip()


def build_rewrite_prompt(resume_text: str, job: str) -> str:
    return f"""
You are an expert resume writer and ATS optimization specialist.

Rewrite the resume below to be highly optimized for the job description.

Resume:
{resume_text}

Job Description:
{job}

Rules:
- Keep all real facts, companies, dates, and education - do NOT fabricate anything
- Rewrite bullet points to use strong action verbs and quantify where possible
- Naturally incorporate missing keywords from the job description
- Improve phrasing to be more impactful and ATS-friendly
- Keep the same general structure (Summary, Experience, Skills, Education)
- Return the full rewritten resume as clean plain text
- Use ALL CAPS for section headers (e.g. EXPERIENCE, SKILLS, EDUCATION)
""".strip()


# ── Routes ─────────────────────────────────────────────────────────────────────
@app.get("/")
async def home():
    return {"message": "CareerPilot API is running"}


@app.post("/upload-resume")
async def upload_resume(
    resume: UploadFile = File(...),
    job: str = Form(...)
):
    if not job.strip():
        raise HTTPException(status_code=400, detail="No job description provided.")

    try:
        file_bytes = await resume.read()
        resume_text = extract_pdf_text(file_bytes)

        if not resume_text:
            raise HTTPException(status_code=400, detail="Could not extract text from PDF. Is it a scanned image?")

        prompt = build_analysis_prompt(resume_text, job)
        response = model.generate_content(prompt)

        return {
            "result": response.text,
            "resume_text": resume_text
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.post("/cover-letter")
async def cover_letter(request: AnalyzeRequest):
    if not request.resume_text.strip() or not request.job.strip():
        raise HTTPException(status_code=400, detail="Resume text and job description are required.")

    try:
        prompt = build_cover_letter_prompt(request.resume_text, request.job)
        response = model.generate_content(prompt)
        return {"cover_letter": response.text}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cover letter generation failed: {str(e)}")


@app.post("/rewrite-resume")
async def rewrite_resume(request: AnalyzeRequest):
    if not request.resume_text.strip() or not request.job.strip():
        raise HTTPException(status_code=400, detail="Resume text and job description are required.")

    try:
        prompt = build_rewrite_prompt(request.resume_text, request.job)
        response = model.generate_content(prompt)
        return {"rewritten": response.text}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Resume rewrite failed: {str(e)}")


@app.post("/export-pdf")
async def export_pdf(request: ExportRequest):
    try:
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            rightMargin=0.75 * inch,
            leftMargin=0.75 * inch,
            topMargin=0.75 * inch,
            bottomMargin=0.75 * inch,
        )

        styles = getSampleStyleSheet()

        title_style = ParagraphStyle(
            "CPTitle", parent=styles["Normal"],
            fontSize=22, fontName="Helvetica-Bold",
            textColor=colors.HexColor("#4f46e5"),
            spaceAfter=4,
        )
        subtitle_style = ParagraphStyle(
            "CPSubtitle", parent=styles["Normal"],
            fontSize=11, textColor=colors.HexColor("#6b7280"),
            spaceAfter=16,
        )
        section_style = ParagraphStyle(
            "CPSection", parent=styles["Normal"],
            fontSize=13, fontName="Helvetica-Bold",
            textColor=colors.HexColor("#1f2937"),
            spaceBefore=14, spaceAfter=6,
        )
        body_style = ParagraphStyle(
            "CPBody", parent=styles["Normal"],
            fontSize=10, leading=16,
            textColor=colors.HexColor("#374151"),
        )

        story = []
        story.append(Paragraph("CareerPilot AI", title_style))
        story.append(Paragraph(f"Resume Analysis Report - ATS Score: {request.score}/100", subtitle_style))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e5e7eb")))
        story.append(Spacer(1, 12))

        if request.analysis:
            for line in request.analysis.split("\n"):
                line = line.strip()
                if not line:
                    story.append(Spacer(1, 6))
                    continue
                clean = line.replace("##", "").replace("**", "").replace("*", "").strip()
                if line.startswith("## "):
                    story.append(Paragraph(clean, section_style))
                else:
                    story.append(Paragraph(clean, body_style))

        if request.cover_letter:
            story.append(Spacer(1, 16))
            story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e5e7eb")))
            story.append(Spacer(1, 12))
            story.append(Paragraph("Cover Letter", section_style))
            for line in request.cover_letter.split("\n"):
                line = line.strip()
                if not line:
                    story.append(Spacer(1, 6))
                else:
                    story.append(Paragraph(line, body_style))

        doc.build(story)
        buffer.seek(0)

        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=careerpilot_report.pdf"}
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF export failed: {str(e)}")
    

def build_explanation_prompt(resume_text: str, job: str, score_breakdown) -> str:
    """
    Unlike build_analysis_prompt() in the original version, this prompt does
    NOT ask Gemini to invent a score. It is given the score (and the exact
    signals that produced it) and asked only to explain it in natural
    language and suggest improvements. The number itself comes from our
    own TF-IDF + skill-matching algorithm in scoring_engine.py.
    """
    return f"""
You are a career coach. A custom scoring algorithm has already analyzed this
resume against the job description and produced the following results.
Do NOT invent or change the score — explain it and build on it.
 
Computed ATS Match Score: {score_breakdown.final_score}/100
 
Score breakdown (already computed, do not recalculate):
- Text/semantic similarity (TF-IDF cosine): {score_breakdown.tfidf_similarity_score}/100
- Skill keyword match: {score_breakdown.skill_match_score}/100
- Experience signal: {score_breakdown.experience_score}/100
- Resume section completeness: {score_breakdown.section_completeness_score}/100
 
Matched skills (already detected): {', '.join(score_breakdown.matched_skills) or 'None'}
Missing skills (already detected): {', '.join(score_breakdown.missing_skills) or 'None'}
Resume sections found: {', '.join(score_breakdown.resume_sections_found) or 'None'}
 
Resume:
{resume_text}
 
Job Description:
{job}
 
Respond in this exact markdown format:
 
## Match Summary
[2-3 sentences explaining IN PLAIN LANGUAGE why the score came out this way,
referencing the breakdown above. Do not state a different score.]
 
## Why These Skills Matched
[1-2 sentences on the matched skills and how strongly they align with the role.]
 
## Why These Skills Are Missing
[1-2 sentences on the missing skills and how critical they likely are for this role.]
 
## Suggestions
1. [Actionable suggestion 1, tailored to the missing skills/weak sections above]
2. [Actionable suggestion 2]
3. [Actionable suggestion 3]
 
## Recommended Resume Tweaks
- [Specific tweak 1]
- [Specific tweak 2]
- [Specific tweak 3]
""".strip()
 
 
@app.post("/upload-resume-v2")
async def upload_resume_v2(
    resume: UploadFile = File(...),
    job: str = Form(...)
):
    """
    Custom-scoring version of the analyze endpoint.
 
    Pipeline:
      1. Extract resume text from PDF (pdfplumber) — same as before.
      2. Run OUR OWN scoring algorithm (scoring_engine.compute_match_score):
         TF-IDF cosine similarity + skill keyword matching + experience
         heuristic + section completeness, combined via a weighted formula.
      3. Pass that score + its breakdown to Gemini ONLY to generate a
         natural-language explanation and suggestions — Gemini never
         decides the number.
 
    This keeps the score itself fully deterministic and explainable
    independent of the LLM, which is the core academic contribution of
    this version of the project.
    """
    if not job.strip():
        raise HTTPException(status_code=400, detail="No job description provided.")
 
    try:
        file_bytes = await resume.read()
        resume_text = extract_pdf_text(file_bytes)
 
        if not resume_text:
            raise HTTPException(
                status_code=400,
                detail="Could not extract text from PDF. Is it a scanned image?"
            )
 
        # ---- Step A: OUR OWN scoring algorithm (no LLM) ----
        score_breakdown = compute_match_score(resume_text, job)
 
        # ---- Step B: Gemini explains the already-computed score ----
        explanation_prompt = build_explanation_prompt(resume_text, job, score_breakdown)
        response = model.generate_content(explanation_prompt)
 
        return {
            "score": score_breakdown.final_score,
            "score_breakdown": {
                "tfidf_similarity": score_breakdown.tfidf_similarity_score,
                "skill_match": score_breakdown.skill_match_score,
                "experience_signal": score_breakdown.experience_score,
                "section_completeness": score_breakdown.section_completeness_score,
            },
            "matched_skills": score_breakdown.matched_skills,
            "missing_skills": score_breakdown.missing_skills,
            "resume_sections_found": score_breakdown.resume_sections_found,
            "explanation": response.text,
            "resume_text": resume_text,
        }
 
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

