import os
import re
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables from the .env file next to this script
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
dotenv_path = os.path.join(BASE_DIR, '.env')
load_dotenv(dotenv_path)

# Retrieve API key
api_key = os.getenv("GEMINI_API_KEY")
genai.configure(api_key=api_key)

# ── Intent Detection ───────────────────────────────────────────────────────────
# Keywords that signal the user is asking about THEIR OWN result
PERSONAL_RESULT_TRIGGERS = [
    r"\bmy\s+(result|scan|mri|prediction|diagnosis|report|finding)\b",
    r"\bmy\s+(mild|moderate|non|very mild)\b",
    r"\bwhat does my\b",
    r"\bexplain my\b",
    r"\bwhy did my\b",
    r"\bmy score\b",
    r"\bmy confidence\b",
    r"\bwhat do (i|my results?) have\b",
    r"\bam i\s+(demented|diagnosed|at risk)\b",
    r"\bdo i have\b",
    r"\bmy symptoms\b",
    r"\bmy condition\b",
    r"\bwhat should i do\b",
    r"\badvice for me\b",
    r"\bmy treatment\b",
]

# Keywords that signal the user wants medical advice (needs disclaimer)
MEDICAL_ADVICE_TRIGGERS = [
    r"\bshould i (see|visit|consult|take|start|stop)\b",
    r"\bwhat (medicine|medication|drug|treatment|therapy)\b",
    r"\bcan (i|this) be (cured|treated|reversed)\b",
    r"\bdo i need (a doctor|treatment|medicine|surgery)\b",
    r"\bis (this|it) serious\b",
    r"\bhow (long|serious|bad)\b",
    r"\bprogress(ion)?\b",
]

def _classify_intent(message: str) -> tuple[bool, bool]:
    """
    Returns:
        use_prediction_context (bool) — inject latest scan result
        add_disclaimer (bool)         — append medical disclaimer
    """
    msg = message.lower()

    is_personal = any(re.search(p, msg) for p in PERSONAL_RESULT_TRIGGERS)
    is_medical_advice = any(re.search(p, msg) for p in MEDICAL_ADVICE_TRIGGERS)

    use_prediction_context = is_personal
    add_disclaimer = is_personal or is_medical_advice

    return use_prediction_context, add_disclaimer


# ── System Prompts ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT_BASE = """You are NeuroBot, an AI assistant built into NeuroVista — an Alzheimer's
detection platform that analyses brain MRI scans using a CNN+BiLSTM deep learning model.

NeuroVista classifies every MRI scan into exactly one of four categories:
  • Non Demented        — no detectable signs of dementia
  • Very Mild Demented  — very early subtle changes; most daily functions preserved
  • Mild Demented       — noticeable cognitive changes; some assistance with tasks advised
  • Moderate Demented   — significant impairment; regular medical supervision required

YOUR ROLE:
Answer questions about:
  - Alzheimer's disease and its stages
  - Dementia types and symptoms
  - Brain health and cognitive wellness
  - MRI scans and what they show
  - GradCAM heatmaps and how they work
  - How NeuroVista works (CNN+BiLSTM, confidence scores, classification)

Politely decline questions that are completely unrelated to brain health or NeuroVista.

RESPONSE STYLE:
- Clear, friendly, educational tone.
- Use bullet points or short paragraphs when helpful.
- Use **Bold Label:** format for section headings inside your response — do NOT use ## markdown headers.
- Keep responses concise (under 200 words unless the question clearly needs more depth).
- Do NOT add any medical disclaimer unless the question is about the user's own scan or medical advice.
- Do NOT start every response with "Important Reminder" or any disclaimer boilerplate.
"""

SYSTEM_PROMPT_WITH_DISCLAIMER = SYSTEM_PROMPT_BASE + """
DISCLAIMER RULE (active for this message):
Since the user is asking about their own result or seeking medical guidance, end your response
with this exact block — nothing more, nothing less:

---
⚠️ **Note:** NeuroVista provides an AI-generated classification, not a formal medical diagnosis.
Please consult a qualified neurologist or physician for confirmed diagnosis and treatment.
"""

SYSTEM_PROMPT_NO_DISCLAIMER = SYSTEM_PROMPT_BASE + """
DISCLAIMER RULE (active for this message):
This is a general educational question. Do NOT add any disclaimer, reminder, or note about
medical diagnosis. Answer it like a knowledgeable health educator would — directly and clearly.
"""


# ── Per-user session store ─────────────────────────────────────────────────────
_sessions: dict[str, list[dict]] = {}
MAX_HISTORY_TURNS = 8


def _get_session(user_id: str) -> list[dict]:
    if user_id not in _sessions:
        _sessions[user_id] = []
    return _sessions[user_id]


def _trim_history(history: list[dict]) -> None:
    max_messages = MAX_HISTORY_TURNS * 2
    if len(history) > max_messages:
        del history[: len(history) - max_messages]


# ── Main chat function ─────────────────────────────────────────────────────────
def get_chat_response(
    message: str,
    user_id: str = "default",
    latest_prediction: str | None = None,
    confidence: float | None = None,
) -> str:
    history = _get_session(user_id)

    # Classify intent
    use_prediction_context, add_disclaimer = _classify_intent(message)

    # Only inject scan context when user is asking about their own result
    if use_prediction_context and latest_prediction:
        conf_text = f" with {confidence:.1f}% confidence" if confidence else ""
        context_prefix = (
            f"[NeuroVista scan context: this user's latest MRI result is "
            f"'{latest_prediction}'{conf_text}. Use this only if directly relevant.]\n\n"
        )
        full_message = context_prefix + message
    else:
        full_message = message

    # Pick system prompt based on whether disclaimer is needed
    system_prompt = (
        SYSTEM_PROMPT_WITH_DISCLAIMER if add_disclaimer
        else SYSTEM_PROMPT_NO_DISCLAIMER
    )

    history.append({"role": "user", "parts": [full_message]})

    try:
        model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            system_instruction=system_prompt,
        )

        chat = model.start_chat(history=history[:-1])

        response = chat.send_message(
            full_message,
            generation_config={
                "temperature": 0.4,
                "top_p": 0.9,
                "max_output_tokens": 600,
            },
        )

        answer = response.text.strip()

        history.append({"role": "model", "parts": [answer]})
        _trim_history(history)

        return answer

    except Exception as e:
        if history and history[-1]["role"] == "user":
            history.pop()
        return f"Sorry, I encountered an error: {str(e)}"
