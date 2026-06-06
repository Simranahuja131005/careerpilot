from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
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
 
load_dotenv()
 
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-2.5-flash")
 
app = Flask(__name__)
CORS(app)
 
 
def extract_pdf_text(file):
    text = ""
    with pdfplumber.open(file) as pdf:
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
- Return the full rewritten resume as clean plain text, no markdown headers with ##
- Use ALL CAPS for section headers (e.g. EXPERIENCE, SKILLS, EDUCATION)
""".strip()
 
 
@app.route("/")
def home():
    return "CareerPilot Backend Running"
 
 
@app.route("/upload-resume", methods=["POST"])
def upload_resume():
    file = request.files.get("resume")
    job = request.form.get("job", "").strip()
 
    if not file:
        return jsonify({"error": "No resume file provided."}), 400
    if not job:
        return jsonify({"error": "No job description provided."}), 400
 
    try:
        resume_text = extract_pdf_text(file)
        if not resume_text:
            return jsonify({"error": "Could not extract text from the PDF. Is it a scanned image?"}), 400
 
        prompt = build_analysis_prompt(resume_text, job)
        response = model.generate_content(prompt)
 
        return jsonify({
            "result": response.text,
            "resume_text": resume_text
        })
    except Exception as e:
        return jsonify({"error": f"Analysis failed: {str(e)}"}), 500
 
 
@app.route("/cover-letter", methods=["POST"])
def cover_letter():
    data = request.json or {}
    resume_text = data.get("resume_text", "").strip()
    job = data.get("job", "").strip()
 
    if not resume_text or not job:
        return jsonify({"error": "Resume text and job description are required."}), 400
 
    try:
        prompt = build_cover_letter_prompt(resume_text, job)
        response = model.generate_content(prompt)
        return jsonify({"cover_letter": response.text})
    except Exception as e:
        return jsonify({"error": f"Cover letter generation failed: {str(e)}"}), 500
 
 
@app.route("/rewrite-resume", methods=["POST"])
def rewrite_resume():
    data = request.json or {}
    resume_text = data.get("resume_text", "").strip()
    job = data.get("job", "").strip()
 
    if not resume_text or not job:
        return jsonify({"error": "Resume text and job description are required."}), 400
 
    try:
        prompt = build_rewrite_prompt(resume_text, job)
        response = model.generate_content(prompt)
        return jsonify({"rewritten": response.text})
    except Exception as e:
        return jsonify({"error": f"Resume rewrite failed: {str(e)}"}), 500
 
 
@app.route("/export-pdf", methods=["POST"])
def export_pdf():
    data = request.json or {}
    analysis = data.get("analysis", "")
    cover_letter_text = data.get("cover_letter", "")
    score = data.get("score", "N/A")
 
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
        story.append(Paragraph(f"Resume Analysis Report - ATS Score: {score}/100", subtitle_style))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e5e7eb")))
        story.append(Spacer(1, 12))
 
        if analysis:
            for line in analysis.split("\n"):
                line = line.strip()
                if not line:
                    story.append(Spacer(1, 6))
                    continue
                clean = line.replace("##", "").replace("**", "").replace("*", "").strip()
                if line.startswith("## "):
                    story.append(Paragraph(clean, section_style))
                else:
                    story.append(Paragraph(clean, body_style))
 
        if cover_letter_text:
            story.append(Spacer(1, 16))
            story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e5e7eb")))
            story.append(Spacer(1, 12))
            story.append(Paragraph("Cover Letter", section_style))
            for line in cover_letter_text.split("\n"):
                line = line.strip()
                if not line:
                    story.append(Spacer(1, 6))
                else:
                    story.append(Paragraph(line, body_style))
 
        doc.build(story)
        buffer.seek(0)
 
        return send_file(
            buffer,
            mimetype="application/pdf",
            as_attachment=True,
            download_name="careerpilot_report.pdf",
        )
    except Exception as e:
        return jsonify({"error": f"PDF export failed: {str(e)}"}), 500
 
 
if __name__ == "__main__":
    app.run(debug=True)