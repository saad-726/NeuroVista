"""
explainer.py — Explainable AI (XAI) engine for Neuro Vista.

Generates a detailed, human-readable explanation of WHY the CNN+BiLSTM model
classified an MRI scan as a specific Alzheimer's stage. Uses Gemini for
rich personalised explanations, with a comprehensive rule-based fallback.
"""

from __future__ import annotations

import os
import re
from typing import Optional, Dict, Any

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------------------
# Per-class XAI knowledge base (used for fallback + prompt grounding)
# ---------------------------------------------------------------------------

XAI_KNOWLEDGE: Dict[str, Dict[str, Any]] = {
    "Non Demented": {
        "primary_regions": [
            "Hippocampus (Preserved Volume)",
            "Entorhinal Cortex (Intact Signal)",
            "Prefrontal Cortex (Normal Density)",
            "Temporal Lobes (Symmetric Structure)"
        ],
        "heatmap_description": (
            "The Grad-CAM overlay displays uniform, diffuse low-intensity cool tones (blue-cyan). "
            "There are no focal clusters of high neural activation in the memory centers."
        ),
        "why_classified": (
            "Cortical thickness, ventricular size, and bilateral hippocampal volumes match healthy baseline thresholds. "
            "The hybrid CNN-BiLSTM network found no signs of structural atrophy or neurodegenerative progression."
        ),
        "feature_explanation": (
            "Key features that contributed to this classification:\n"
            "• Symmetrical grey matter density across both hemispheres\n"
            "• Preserved hippocampal volume with no focal shrinkage\n"
            "• Normal ventricular architecture without compensatory enlargement\n"
            "• Intact entorhinal and medial temporal cortex margins"
        ),
        "confidence_context": "Both spatial CNN features and BiLSTM sequential patterns strongly align with healthy baseline criteria.",
        "patient_message": "No measurable neurodegenerative biomarkers detected on this scan. Regular lifestyle habits and routine checkups are recommended to maintain brain health.",
        "color": "#16a34a",
        "risk_level": "Low Risk",
        "risk_badge": "normal",
    },
    "Very Mild Demented": {
        "primary_regions": [
            "Medial Temporal Lobe (Subtle Atrophy)",
            "Entorhinal Cortex (Early Biomarker Area)",
            "Hippocampal Margins (Borderline Changes)",
            "Inferior Parietal Region"
        ],
        "heatmap_description": (
            "Localized low-to-moderate activation (yellow-green highlights) centered on the medial temporal lobes. "
            "Surrounding cortical structures maintain baseline blue tones."
        ),
        "why_classified": (
            "The network detected early, subtle volume reductions along the entorhinal cortex and hippocampal border, "
            "consistent with early-stage neurofibrillary changes (Braak stages I-II)."
        ),
        "feature_explanation": (
            "Key features that contributed to this classification:\n"
            "• Subtle bilateral asymmetry in medial temporal lobes\n"
            "• Minor volumetric decrease along entorhinal borders\n"
            "• Borderline hippocampal attenuation compared to age-matched norms\n"
            "• Frontal and occipital regions remain preserved"
        ),
        "confidence_context": "The model identified micro-structural variations characteristic of earliest preclinical/very mild cognitive shifts.",
        "patient_message": "Very subtle, early changes detected in memory-linked pathways. Early intervention, mental exercises, and baseline clinical follow-up yield maximum efficacy at this stage.",
        "color": "#f59e0b",
        "risk_level": "Early Stage",
        "risk_badge": "vmild",
    },
    "Mild Demented": {
        "primary_regions": [
            "Hippocampus (Noticeable Shrinkage)",
            "Temporal Cortex (Cortical Thinning)",
            "Parietal Association Cortex",
            "Posterior Cingulate Gyrus"
        ],
        "heatmap_description": (
            "Prominent warm activation (yellow-to-red clusters) focused over the hippocampal formation and temporal-parietal junction, "
            "highlighting primary classification drivers."
        ),
        "why_classified": (
            "Distinct structural shrinkage in the hippocampus and temporal lobe sulcal enlargement. "
            "The BiLSTM sequential spatial filter flagged pattern progression typical of mild Alzheimer's disease."
        ),
        "feature_explanation": (
            "Key features that contributed to this classification:\n"
            "• Measurable hippocampal atrophy and widened temporal sulci\n"
            "• Cortical thinning in temporal and posterior parietal networks\n"
            "• Compensatory ventricular dilatation (ex vacuo effect)\n"
            "• Strong neural focus on the temporal-parietal memory axis"
        ),
        "confidence_context": "Clear imaging hallmarks in temporal memory networks drive high classification certainty.",
        "patient_message": "Noticeable changes identified in primary memory circuits. Neurological consultation and cognitive management plans are strongly encouraged.",
        "color": "#ea580c",
        "risk_level": "Mild Stage",
        "risk_badge": "mild",
    },
    "Moderate Demented": {
        "primary_regions": [
            "Bilateral Hippocampi (Marked Atrophy)",
            "Temporoparietal Junction (Extensive Loss)",
            "Frontal Association Cortex",
            "Lateral Ventricles (Prominent Dilation)"
        ],
        "heatmap_description": (
            "Widespread high-intensity hotspots (dark red and orange) spanning temporal, parietal, and frontal zones, "
            "indicating widespread network involvement."
        ),
        "why_classified": (
            "Extensive bilateral cortical atrophy, pronounced ventricular enlargement, and profound tissue loss "
            "along default-mode and associative memory networks (Braak stages V-VI)."
        ),
        "feature_explanation": (
            "Key features that contributed to this classification:\n"
            "• Severe hippocampal volume reduction\n"
            "• Diffuse temporoparietal and frontal cortical thinning\n"
            "• Prominent lateral ventricular enlargement\n"
            "• Multi-region neural activation confirming multi-domain involvement"
        ),
        "confidence_context": "Diffuse multi-lobar degeneration patterns present high diagnostic agreement across both CNN and BiLSTM layers.",
        "patient_message": "Advanced structural alterations detected across cognitive processing networks. Comprehensive medical evaluation and structured supportive care are advised.",
        "color": "#e11d48",
        "risk_level": "Moderate Stage",
        "risk_badge": "moderate",
    },
}

# Map UI labels to keys
_LABEL_MAP = {
    "non demented": "Non Demented",
    "very mild demented": "Very Mild Demented",
    "mild demented": "Mild Demented",
    "moderate demented": "Moderate Demented",
}


def _normalise(prediction: str) -> str:
    lower = prediction.lower().strip()
    for fragment, canonical in _LABEL_MAP.items():
        if fragment in lower:
            return canonical
    return "Non Demented"


# ---------------------------------------------------------------------------
# Gemini-powered XAI explanation generator
# ---------------------------------------------------------------------------

def _build_ai_explanation(
    prediction: str,
    confidence: float,
    prob_non: float,
    prob_vmild: float,
    prob_mild: float,
    prob_moderate: float,
) -> Optional[str]:
    """
    Uses Gemini to generate a detailed, personalised XAI explanation.
    Returns the explanation string, or None on failure.
    """
    try:
        import google.generativeai as genai
        from dotenv import load_dotenv

        load_dotenv(os.path.join(BASE_DIR, ".env"))
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return None

        genai.configure(api_key=api_key)

        kb = XAI_KNOWLEDGE.get(prediction, XAI_KNOWLEDGE["Non Demented"])

        prompt = f"""You are a clinical neuro-imaging expert writing an Explainable AI (XAI) summary for an Alzheimer's MRI scan classification.

SCAN DATA:
- Predicted Stage: {prediction}
- Confidence: {confidence:.1f}%
- Probabilities: Non-Demented: {prob_non:.1f}%, Very Mild: {prob_vmild:.1f}%, Mild: {prob_mild:.1f}%, Moderate: {prob_moderate:.1f}%

KNOWLEDGE REFERENCE:
- Main Brain Regions: {', '.join(kb['primary_regions'])}
- Heatmap Highlights: {kb['heatmap_description']}
- Diagnostic Basis: {kb['why_classified']}

FORMAT REQUIREMENT:
Provide a concise, professional 3-point clinical summary. Strictly use these bold headers and keep each point to 1-2 punchy, informative sentences:

**Heatmap Activation:** (Describe where the warm Grad-CAM clusters appear and the anatomical significance)
**Diagnostic Rationale:** (Explain the specific structural cues detected by the CNN+BiLSTM that drove this output)
**Clinical Takeaway:** (Provide a clear, reassuring recommendation or next clinical step)

Tone: Authoritative, objective, patient-accessible, concise (strictly under 140 words total). Do not include pleasantries, disclaimers, or extra headings.
"""

        model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            system_instruction="You are a compassionate medical AI that explains brain scan results clearly to patients.",
        )
        response = model.generate_content(
            prompt,
            generation_config={
                "temperature": 0.35,
                "top_p": 0.9,
                "max_output_tokens": 1000,
            },
        )
        return response.text.strip()

    except Exception as e:
        print(f"[Explainer] Gemini call failed: {e}")
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_xai_explanation(
    prediction: str,
    confidence: float = 0.0,
    prob_non: float = 0.0,
    prob_vmild: float = 0.0,
    prob_mild: float = 0.0,
    prob_moderate: float = 0.0,
) -> Dict[str, Any]:
    """
    Returns a complete XAI explanation dict for a prediction result.

    Contains:
      - ai_explanation: str (Gemini or rule-based fallback)
      - regions: list[str] - primary brain regions activated
      - heatmap_description: str - what to look for in the heatmap
      - feature_explanation: str - bullet-point feature breakdown
      - patient_message: str - plain language patient summary
      - color: str - CSS colour for the class
      - risk_level: str
      - risk_badge: str - CSS class name
    """
    canonical = _normalise(prediction)
    kb = XAI_KNOWLEDGE.get(canonical, XAI_KNOWLEDGE["Non Demented"])

    # Normalise probabilities to percentages if stored as decimals
    def to_pct(v: float) -> float:
        return v * 100.0 if v <= 1.0 else v

    conf_pct = to_pct(confidence)
    p_non = to_pct(prob_non)
    p_vmild = to_pct(prob_vmild)
    p_mild = to_pct(prob_mild)
    p_mod = to_pct(prob_moderate)

    # Try Gemini first
    ai_text = _build_ai_explanation(
        canonical, conf_pct, p_non, p_vmild, p_mild, p_mod
    )

    if not ai_text:
        # Fallback: compose from knowledge base
        ai_text = (
            f"**Heatmap Activation:** {kb['heatmap_description']}\n\n"
            f"**Diagnostic Rationale:** {kb['why_classified']}\n\n"
            f"**Clinical Takeaway:** {kb['patient_message']}"
        )

    return {
        "ai_explanation": ai_text,
        "regions": kb["primary_regions"],
        "heatmap_description": kb["heatmap_description"],
        "feature_explanation": kb["feature_explanation"],
        "patient_message": kb["patient_message"],
        "confidence_context": kb["confidence_context"],
        "color": kb["color"],
        "risk_level": kb["risk_level"],
        "risk_badge": kb["risk_badge"],
        "prediction": canonical,
        "confidence_pct": round(conf_pct, 1),
    }
