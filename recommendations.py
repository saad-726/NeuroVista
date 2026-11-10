"""
recommendations.py — AI-powered treatment recommendation engine for Neuro Vista.

Generates dynamic, clinically appropriate recommendation cards based on the
Alzheimer's classification result. Uses Gemini if available; falls back to a
rich rule-based set so the UI always shows meaningful content.
"""

from __future__ import annotations

import os
import json
import re
from typing import List, Dict, Optional

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------------------
# Rule-based fallback cards (rich, clinical, per-class)
# ---------------------------------------------------------------------------

_FALLBACK_CARDS: dict[str, list[dict]] = {
    "Non Demented": [
        {
            "icon": "✦",
            "title": "Maintain Brain Health",
            "description": "Your scan shows no detectable signs of dementia. Continue engaging in regular cognitive stimulation activities such as reading, puzzles, and social interaction to preserve brain health.",
            "priority": "Standard",
            "priority_level": "standard",
        },
        {
            "icon": "◈",
            "title": "Annual Screening",
            "description": "Schedule an annual MRI follow-up to monitor baseline brain volume. Early detection remains the most powerful tool — routine screening protects against future progression.",
            "priority": "Recommended",
            "priority_level": "medium",
        },
        {
            "icon": "◎",
            "title": "Lifestyle Optimisation",
            "description": "Sustain a Mediterranean-style diet rich in omega-3s, antioxidants, and low glycaemic foods. Target 150 minutes of aerobic activity per week to support cerebrovascular health.",
            "priority": "Standard",
            "priority_level": "standard",
        },
        {
            "icon": "⊙",
            "title": "Sleep Hygiene",
            "description": "Prioritise 7–8 hours of quality sleep nightly. During deep sleep, the glymphatic system clears neurotoxic waste (including amyloid-β) — consistent sleep dramatically reduces long-term risk.",
            "priority": "Standard",
            "priority_level": "standard",
        },
        {
            "icon": "◌",
            "title": "Stress & Mental Wellness",
            "description": "Chronic stress elevates cortisol, which is linked to hippocampal atrophy. Practice mindfulness, breathing exercises, or yoga for at least 10 minutes daily to manage stress effectively.",
            "priority": "Standard",
            "priority_level": "standard",
        },
        {
            "icon": "◇",
            "title": "Cardiovascular Risk Management",
            "description": "Control blood pressure, cholesterol, and blood sugar levels. Vascular risk factors are strongly associated with accelerated cognitive ageing — keep your heart healthy to keep your brain healthy.",
            "priority": "Standard",
            "priority_level": "standard",
        },
    ],
    "Very Mild Demented": [
        {
            "icon": "◈",
            "title": "Cognitive Baseline Assessment",
            "description": "Administer the Montreal Cognitive Assessment (MoCA) or Mini-Mental State Examination (MMSE) to quantify current cognitive status and establish a formal baseline for tracking subtle changes over time.",
            "priority": "High Priority",
            "priority_level": "high",
        },
        {
            "icon": "✦",
            "title": "Cognitive Training Programme",
            "description": "Enrol in a structured cognitive rehabilitation programme. Daily memory recall drills, dual-task exercises, and language-based activities have shown measurable benefit at the very mild stage when neuroplasticity is still high.",
            "priority": "High Priority",
            "priority_level": "high",
        },
        {
            "icon": "◎",
            "title": "Neurologist Consultation",
            "description": "Schedule a consultation with a neurologist or geriatrician to review this scan. At the very mild stage, early pharmacological or non-pharmacological interventions may meaningfully slow progression.",
            "priority": "Medium Priority",
            "priority_level": "medium",
        },
        {
            "icon": "⊙",
            "title": "Follow-up MRI in 6 Months",
            "description": "Repeat MRI imaging in 6 months to compare hippocampal volume and white matter changes. Longitudinal data is essential to distinguish stable cognitive ageing from early Alzheimer's pathology.",
            "priority": "Medium Priority",
            "priority_level": "medium",
        },
        {
            "icon": "◌",
            "title": "Dietary & Exercise Intervention",
            "description": "Adopt a MIND diet (Mediterranean–DASH hybrid) and engage in 30 minutes of moderate aerobic exercise 5×/week. Combined dietary and exercise intervention has demonstrated neuroprotective effects in early-stage cases.",
            "priority": "Standard",
            "priority_level": "standard",
        },
        {
            "icon": "◇",
            "title": "Sleep & Stress Optimisation",
            "description": "Address any sleep disorders (consider a polysomnography referral if suspected). Elevated cortisol from chronic stress disproportionately damages the hippocampus at this vulnerable stage — structured stress management is critical.",
            "priority": "Standard",
            "priority_level": "standard",
        },
    ],
    "Mild Demented": [
        {
            "icon": "◈",
            "title": "Cholinesterase Inhibitor Review",
            "description": "Consult a neurologist regarding initiation of FDA-approved cholinesterase inhibitors (Donepezil 5–10 mg/day or Rivastigmine patch). These agents are most effective at the mild stage and may delay symptom progression for 6–12 months.",
            "priority": "High Priority",
            "priority_level": "high",
        },
        {
            "icon": "✦",
            "title": "Neuropsychological Evaluation",
            "description": "Complete a full neuropsychological battery (MMSE, MoCA, CDR scale) to characterise the specific cognitive domains affected. This guides tailored rehabilitation planning and legal capacity assessments.",
            "priority": "High Priority",
            "priority_level": "high",
        },
        {
            "icon": "◎",
            "title": "Safety & Daily Living Support",
            "description": "Implement structured daily routines and cognitive aids (calendars, labelled storage, medication reminders). Assess home safety for fall risks and wandering hazards. Occupational therapy referral is recommended.",
            "priority": "High Priority",
            "priority_level": "high",
        },
        {
            "icon": "⊙",
            "title": "Caregiver Education & Support",
            "description": "Engage family members or caregivers in a formal dementia care education programme. Connect with the Alzheimer's Association for carer support groups, respite care resources, and legal/financial planning guidance.",
            "priority": "Medium Priority",
            "priority_level": "medium",
        },
        {
            "icon": "◌",
            "title": "Structured Physical & Cognitive Activity",
            "description": "Prescribe a combined exercise + cognitive stimulation programme (e.g., aerobic walking + music therapy + group reminiscence therapy). Multi-domain interventions show additive neuroprotective benefits at the mild stage.",
            "priority": "Medium Priority",
            "priority_level": "medium",
        },
        {
            "icon": "◇",
            "title": "Repeat Imaging & Biomarker Tracking",
            "description": "Schedule MRI with volumetric analysis every 6 months. Consider PET amyloid scanning or CSF biomarker (Aβ42/tau ratio) testing to confirm Alzheimer's pathology and guide precision treatment decisions.",
            "priority": "Standard",
            "priority_level": "standard",
        },
    ],
    "Moderate Demented": [
        {
            "icon": "◈",
            "title": "Urgent Specialist Referral",
            "description": "Arrange immediate referral to a memory clinic or geriatric psychiatrist. At the moderate stage, coordinated multi-disciplinary care (neurology, psychiatry, social work, OT) is essential to manage escalating cognitive and behavioural symptoms.",
            "priority": "High Priority",
            "priority_level": "high",
        },
        {
            "icon": "✦",
            "title": "Memantine + Cholinesterase Combination",
            "description": "Discuss combination therapy with the prescribing neurologist — Memantine (NMDA antagonist) added to a cholinesterase inhibitor has shown statistically significant benefit in moderate-stage Alzheimer's (MMSE 10–20). Never self-medicate.",
            "priority": "High Priority",
            "priority_level": "high",
        },
        {
            "icon": "◎",
            "title": "Behavioural & Psychiatric Symptom Management",
            "description": "Screen for BPSD (agitation, depression, psychosis, sleep disturbance). Non-pharmacological approaches (structured activity, music, light therapy) should be first-line. Atypical antipsychotics require careful risk-benefit evaluation.",
            "priority": "High Priority",
            "priority_level": "high",
        },
        {
            "icon": "⊙",
            "title": "Full-Time Care Planning",
            "description": "Assess the need for professional in-home care or memory care facility placement. Coordinate with social services for Continuing Care Retirement Community (CCRC) evaluation, benefits eligibility, and advanced care directives.",
            "priority": "High Priority",
            "priority_level": "high",
        },
        {
            "icon": "◌",
            "title": "Sensory & Reminiscence Therapy",
            "description": "Engage in structured sensory stimulation (familiar music, scented objects, tactile activities) and reminiscence therapy using family photographs and life story books. These preserve emotional wellbeing and reduce agitation at moderate stages.",
            "priority": "Medium Priority",
            "priority_level": "medium",
        },
        {
            "icon": "◇",
            "title": "Clinical Trial Eligibility",
            "description": "Consult with a research neurologist regarding enrolment in phase II/III clinical trials for disease-modifying therapies (anti-amyloid, anti-tau, neuroprotective). Eligible patients at this stage may access cutting-edge treatments not yet broadly available.",
            "priority": "Standard",
            "priority_level": "standard",
        },
    ],
}

# Map UI prediction labels → internal keys
_LABEL_MAP = {
    "non demented": "Non Demented",
    "very mild demented": "Very Mild Demented",
    "mild demented": "Mild Demented",
    "moderate demented": "Moderate Demented",
}


def _normalise_prediction(prediction: str) -> str:
    """Return canonical class key from raw prediction string."""
    lower = prediction.lower().strip()
    for fragment, canonical in _LABEL_MAP.items():
        if fragment in lower:
            return canonical
    return "Non Demented"


# ---------------------------------------------------------------------------
# AI-enhanced card generator (Gemini)
# ---------------------------------------------------------------------------

def _build_ai_cards(prediction: str, confidence: Optional[float]) -> Optional[List[Dict]]:
    """
    Try to build cards with Gemini. Returns a list of card dicts on success,
    or None if Gemini is unavailable / returns malformed output.
    """
    try:
        import google.generativeai as genai
        from dotenv import load_dotenv

        dotenv_path = os.path.join(BASE_DIR, ".env")
        load_dotenv(dotenv_path)
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return None

        genai.configure(api_key=api_key)

        conf_text = f" with {confidence:.1f}% model confidence" if confidence else ""
        prompt = f"""
You are a clinical AI assistant for NeuroVista, an Alzheimer's MRI classification system.

A patient's brain MRI has been classified as: **{prediction}**{conf_text}.

Generate exactly 6 personalised clinical recommendation cards for this patient.
Return ONLY a valid JSON array — no markdown, no commentary, no code fences.

Each element must have these exact keys:
  "icon"         : one unicode icon (◈, ✦, ◎, ⊙, ◌, ◇ — use each once)
  "title"        : short card title (4–7 words)
  "description"  : clinically accurate paragraph (40–70 words). Use specific drug names, test names, or guideline references where appropriate.
  "priority"     : one of "High Priority", "Medium Priority", "Standard"
  "priority_level": one of "high", "medium", "standard"

Order cards from highest to lowest priority. Be specific, clinical, and compassionate.
Never give generic advice — tailor everything to the **{prediction}** classification.
"""

        model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            system_instruction="You are a clinical medical AI. Return only valid JSON arrays — no markdown, no extra text.",
        )
        response = model.generate_content(
            prompt,
            generation_config={
                "temperature": 0.3,
                "top_p": 0.9,
                "max_output_tokens": 1200,
            },
        )

        raw = response.text.strip()
        # Strip any accidental code-fence wrappers
        raw = re.sub(r"^```[a-z]*\n?", "", raw, flags=re.IGNORECASE)
        raw = re.sub(r"\n?```$", "", raw, flags=re.IGNORECASE)

        cards = json.loads(raw)
        if isinstance(cards, list) and len(cards) > 0 and "title" in cards[0]:
            return cards

        return None

    except Exception as e:
        print(f"[Recommendations] Gemini call failed: {e}")
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_treatment_recommendations(
    prediction: str,
    confidence: Optional[float] = None,
) -> List[Dict]:
    """
    Returns a list of 6 recommendation card dicts for the given prediction class.

    Tries Gemini first for AI-personalised content; falls back to the
    clinically authored rule-based set if Gemini is unavailable or errors.
    """
    canonical = _normalise_prediction(prediction)

    # Attempt AI-generated cards
    ai_cards = _build_ai_cards(canonical, confidence)
    if ai_cards:
        print(f"[Recommendations] Returning Gemini-generated cards for: {canonical}")
        return ai_cards

    # Fallback: rule-based clinical cards
    print(f"[Recommendations] Returning rule-based cards for: {canonical}")
    return _FALLBACK_CARDS.get(canonical, _FALLBACK_CARDS["Non Demented"])
