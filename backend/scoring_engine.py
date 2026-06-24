"""
scoring_engine.py

This module computes the ATS match score WITHOUT calling any LLM.
It is a self-contained, explainable, mathematically-grounded scoring
algorithm built from:

  1. TF-IDF vectorization of resume vs job description
  2. Cosine similarity between the two TF-IDF vectors (semantic-ish overlap)
  3. Exact + fuzzy skill-keyword matching (extracted skills vs JD keywords)
  4. Experience-duration heuristic
  5. A weighted formula combining all of the above into a single 0-100 score

Gemini is used ELSEWHERE in this project only to *explain* this score in
natural language and suggest improvements — it never decides the number.
This separation is intentional: the score must be reproducible, debuggable,
and defensible independent of any LLM call.
"""

import re
from dataclasses import dataclass, field

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import spacy

from resume_parser import (
    parse_resume_sections,
    extract_skills_list,
    estimate_years_experience,
)

# spaCy's small English model is lazy-loaded on first use rather than at
# import time. This keeps module import cheap and avoids crashing the whole
# app at startup if the model isn't yet downloaded in a given environment —
# the error surfaces only when keyword extraction is actually called.
_nlp = None


def _get_nlp():
    global _nlp
    if _nlp is None:
        _nlp = spacy.load("en_core_web_sm")
    return _nlp


# ── Configurable scoring weights ────────────────────────────────────────────
# These weights are the actual "design decision" of this project — they can
# be tuned, justified, and explained in a viva. They sum to 1.0.
WEIGHTS = {
    "tfidf_similarity": 0.35,   # overall textual/semantic overlap
    "skill_match": 0.40,        # exact skill keyword overlap (most important)
    "experience_signal": 0.15,  # does candidate have relevant experience volume
    "section_completeness": 0.10,  # does resume have all expected sections
}


@dataclass
class ScoreBreakdown:
    final_score: int
    tfidf_similarity_score: float          # 0-100
    skill_match_score: float               # 0-100
    experience_score: float                # 0-100
    section_completeness_score: float      # 0-100
    matched_skills: list[str] = field(default_factory=list)
    missing_skills: list[str] = field(default_factory=list)
    jd_keywords_detected: list[str] = field(default_factory=list)
    resume_sections_found: list[str] = field(default_factory=list)
    years_experience_estimated: float = 0.0


# ── Step 1: TF-IDF similarity ───────────────────────────────────────────────
def compute_tfidf_similarity(resume_text: str, job_text: str) -> float:
    """
    Vectorizes resume and job description using TF-IDF, then computes
    cosine similarity between them. Returns a 0-100 score.

    Why TF-IDF + cosine similarity:
    - TF-IDF down-weights common words ("the", "responsible", "team") and
      up-weights distinctive/rare terms — which tend to be the meaningful
      skill/domain words in a resume or JD.
    - Cosine similarity measures the angle between the two TF-IDF vectors,
      which is a standard, well-understood measure of document similarity
      in information retrieval (used by real-world search/ranking systems).
    """
    documents = [resume_text, job_text]

    vectorizer = TfidfVectorizer(
        stop_words="english",
        ngram_range=(1, 2),   # capture both single words and two-word phrases
        max_features=5000,
    )

    try:
        tfidf_matrix = vectorizer.fit_transform(documents)
    except ValueError:
        # Happens if one document is empty after stopword removal
        return 0.0

    similarity = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:2])[0][0]
    return round(similarity * 100, 2)


# ── Step 2: Keyword extraction from job description ────────────────────────
def extract_jd_keywords(job_text: str, top_n: int = 25) -> list[str]:
    """
    Uses spaCy to extract candidate "important terms" from the job description:
    - Noun chunks (e.g. "machine learning", "REST APIs")
    - Proper nouns / named entities that look like tech/tools (e.g. "Docker")

    This is a lightweight keyword extraction approach — not a full NER model
    trained on tech vocabulary, but effective for surfacing the nouns/skills
    a job description emphasizes.
    """
    doc = _get_nlp()(job_text)

    candidates = set()

    # Noun chunks: short, skill-like phrases
    for chunk in doc.noun_chunks:
        text = chunk.text.strip().lower()
        text = re.sub(r"^(a|an|the)\s+", "", text)
        if 2 <= len(text) <= 35 and not text.isdigit():
            candidates.add(text)

    # Individual proper nouns / nouns (catches single-word tools: "Python", "AWS")
    for token in doc:
        if token.pos_ in ("PROPN", "NOUN") and len(token.text) > 1:
            candidates.add(token.text.lower())

    # Filter out generic filler nouns that aren't useful as "skills"
    generic_blocklist = {
        "team", "experience", "role", "company", "candidate", "ability",
        "knowledge", "work", "job", "years", "skills", "responsibilities",
        "requirements", "opportunity", "environment", "you", "we",
    }
    filtered = [c for c in candidates if c not in generic_blocklist]

    return filtered[:top_n]


# ── Step 3: Skill matching ───────────────────────────────────────────────────
def match_skills(resume_skills: list[str], jd_keywords: list[str]) -> tuple[list[str], list[str]]:
    """
    Compares resume skills against JD keywords using normalized substring
    matching (handles cases like "React.js" in resume vs "react" in JD).

    Returns (matched_skills, missing_skills) — both relative to jd_keywords,
    since the JD defines what's actually required for the role.
    """
    def normalize(s: str) -> str:
        return re.sub(r"[^a-z0-9]", "", s.lower())

    normalized_resume_skills = {normalize(s): s for s in resume_skills}

    matched = []
    missing = []

    for keyword in jd_keywords:
        norm_kw = normalize(keyword)
        if not norm_kw:
            continue

        found = any(
            norm_kw in norm_skill or norm_skill in norm_kw
            for norm_skill in normalized_resume_skills
        )

        if found:
            matched.append(keyword)
        else:
            missing.append(keyword)

    return matched, missing


# ── Step 4: Section completeness ────────────────────────────────────────────
def compute_section_completeness(sections: dict) -> tuple[float, list[str]]:
    """
    Checks how many of the "expected" resume sections are present and
    non-trivially populated. A resume missing Skills or Experience entirely
    is penalized, since ATS systems and recruiters both expect these.
    """
    expected = ["summary", "skills", "experience", "education"]
    found = [key for key in expected if len(sections.get(key, "")) > 15]

    score = (len(found) / len(expected)) * 100
    return round(score, 2), found


# ── Step 5: Experience signal ───────────────────────────────────────────────
def compute_experience_score(years_estimated: float) -> float:
    """
    Converts estimated years of experience into a 0-100 signal.
    Caps at 5+ years = 100, scales linearly below that.
    This is intentionally generous toward students/freshers — internship
    durations of even a few months register as a partial positive signal
    rather than zero.
    """
    capped = min(years_estimated, 5.0)
    return round((capped / 5.0) * 100, 2)


# ── Orchestration: full scoring pipeline ────────────────────────────────────
def compute_match_score(resume_text: str, job_text: str) -> ScoreBreakdown:
    """
    Runs the full custom scoring pipeline and returns a ScoreBreakdown
    with the final weighted score plus every intermediate signal — so the
    score is fully explainable and auditable, not a black box.
    """
    # 1. Parse resume into sections
    sections = parse_resume_sections(resume_text)
    resume_skills_raw = extract_skills_list(sections.get("skills", ""))

    # Also pull skill-like tokens from experience/projects in case the
    # candidate didn't list a dedicated Skills section
    fallback_text = sections.get("experience", "") + " " + sections.get("projects", "")

    # 2. Extract JD keywords
    jd_keywords = extract_jd_keywords(job_text)

    # 3. Skill matching (resume skills section + fallback experience text)
    combined_resume_skill_pool = resume_skills_raw + extract_jd_keywords(fallback_text, top_n=40)
    matched_skills, missing_skills = match_skills(combined_resume_skill_pool, jd_keywords)

    skill_match_score = (
        (len(matched_skills) / len(jd_keywords)) * 100 if jd_keywords else 0.0
    )

    # 4. TF-IDF similarity
    tfidf_score = compute_tfidf_similarity(resume_text, job_text)

    # 5. Section completeness
    completeness_score, found_sections = compute_section_completeness(sections)

    # 6. Experience signal
    years = estimate_years_experience(sections.get("experience", ""))
    experience_score = compute_experience_score(years)

    # 7. Weighted final score — this formula is the project's core contribution
    final_score = (
        tfidf_score * WEIGHTS["tfidf_similarity"]
        + skill_match_score * WEIGHTS["skill_match"]
        + experience_score * WEIGHTS["experience_signal"]
        + completeness_score * WEIGHTS["section_completeness"]
    )

    return ScoreBreakdown(
        final_score=round(final_score),
        tfidf_similarity_score=tfidf_score,
        skill_match_score=round(skill_match_score, 2),
        experience_score=experience_score,
        section_completeness_score=completeness_score,
        matched_skills=matched_skills,
        missing_skills=missing_skills,
        jd_keywords_detected=jd_keywords,
        resume_sections_found=found_sections,
        years_experience_estimated=years,
    )