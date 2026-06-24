"""
resume_parser.py

Parses raw resume text (extracted from PDF) into structured sections:
Summary, Skills, Experience, Education, Projects.

This is rule-based parsing using regex section-header detection — no LLM involved.
The goal is to convert unstructured text into a structured schema that the
scoring engine (scoring_engine.py) can reason about more precisely than
treating the resume as one undifferentiated blob of text.
"""

import re


# Common section header variants seen across resume formats.
# Mapped to a normalized internal key.
SECTION_HEADERS = {
    "summary": [
        "summary", "objective", "professional summary", "career objective",
        "profile", "about me"
    ],
    "skills": [
        "skills", "technical skills", "core competencies", "key skills",
        "skill set", "technologies"
    ],
    "experience": [
        "experience", "work experience", "professional experience",
        "employment history", "work history", "internships", "internship"
    ],
    "education": [
        "education", "academic background", "educational qualifications",
        "academics"
    ],
    "projects": [
        "projects", "academic projects", "personal projects", "key projects"
    ],
    "certifications": [
        "certifications", "certificates", "licenses & certifications"
    ],
}


def _build_header_pattern() -> re.Pattern:
    """
    Builds a single regex that matches any known section header on its own line.
    Headers are matched case-insensitively and allow trailing colons/whitespace.
    """
    all_variants = []
    for variants in SECTION_HEADERS.values():
        all_variants.extend(variants)

    # Sort longest-first so "professional experience" matches before "experience"
    all_variants.sort(key=len, reverse=True)
    escaped = [re.escape(v) for v in all_variants]
    pattern = r"^\s*(" + "|".join(escaped) + r")\s*:?\s*$"
    return re.compile(pattern, re.IGNORECASE | re.MULTILINE)


_HEADER_PATTERN = _build_header_pattern()


def _normalize_header(raw_header: str) -> str:
    """Maps a matched raw header string to its normalized internal key."""
    raw_lower = raw_header.strip().lower()
    for key, variants in SECTION_HEADERS.items():
        if raw_lower in [v.lower() for v in variants]:
            return key
    return "other"


def parse_resume_sections(resume_text: str) -> dict:
    """
    Splits resume_text into a dict of {section_name: section_content}.

    Strategy:
    1. Find every line that matches a known section header.
    2. Everything between two header matches belongs to the first header.
    3. Any text before the first detected header is treated as 'header_info'
       (typically name, contact details, links).

    Returns a dict with keys: header_info, summary, skills, experience,
    education, projects, certifications, other (each may be "" if absent).
    """
    sections = {key: "" for key in SECTION_HEADERS}
    sections["header_info"] = ""
    sections["other"] = ""

    matches = list(_HEADER_PATTERN.finditer(resume_text))

    if not matches:
        # No recognizable headers — treat the whole resume as unstructured.
        sections["other"] = resume_text.strip()
        return sections

    # Text before the first header = contact info / name block
    sections["header_info"] = resume_text[: matches[0].start()].strip()

    for i, match in enumerate(matches):
        header_key = _normalize_header(match.group(1))
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(resume_text)
        content = resume_text[start:end].strip()

        if sections[header_key]:
            sections[header_key] += "\n" + content
        else:
            sections[header_key] = content

    return sections


def extract_skills_list(skills_section: str) -> list[str]:
    """
    Converts a raw 'skills' section into a clean list of individual skill tokens.
    Handles comma, pipe, bullet, and newline separated formats.
    """
    if not skills_section:
        return []

    # Normalize common separators to commas
    normalized = re.sub(r"[•·\u2022\|/]", ",", skills_section)
    normalized = normalized.replace("\n", ",")

    raw_tokens = normalized.split(",")
    skills = []
    for token in raw_tokens:
        cleaned = token.strip().strip(".-: ").strip()
        if cleaned and len(cleaned) <= 40:  # filters out stray sentence fragments
            skills.append(cleaned)

    return skills


def estimate_years_experience(experience_section: str) -> float:
    """
    Rough heuristic: scans for date ranges like '2021 - 2023' or 'Jan 2022 - Present'
    in the experience section and sums up approximate duration in years.
    This is intentionally simple — a heuristic signal for the scoring engine,
    not a precise HR-grade calculation.
    """
    if not experience_section:
        return 0.0

    year_pattern = re.compile(r"(19|20)\d{2}")
    years_found = [int(y) for y in year_pattern.findall(experience_section)]

    if not years_found:
        return 0.0

    # crude estimate: span between earliest and latest year mentioned
    span = max(years_found) - min(years_found)
    return float(max(span, 0.5))  # at least 0.5 if only one role detected