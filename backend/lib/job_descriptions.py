"""Fill the missing descriptions on the three existing, owner-authorized job posts."""

import re
from datetime import datetime, timezone


JOB_DESCRIPTIONS = (
    {
        "id": "52ef8e1d-5a06-480b-81cf-74dec461a087",
        "title": "General worker",
        "description": """Brothers Workforce Solutions is inviting applications for General Worker roles supporting factory and production operations.

Responsibilities:
• Assist the production team with daily tasks according to the supervisor's instructions.
• Sort materials, prepare items for packing and help keep materials organized.
• Support packing, labelling and movement of materials within the assigned work area.
• Check items for visible damage or defects and report concerns to the supervisor.
• Keep the work area clean and follow workplace safety instructions.

Candidate profile:
• Freshers can apply.
• Willingness to learn, follow instructions and work with a team.
• Careful handling of materials, punctuality and attention to quality.

Apply with your contact details and availability. The recruitment team will confirm the exact duties and joining arrangements for the opening.""",
        "description_kn": """ಬ್ರದರ್ಸ್ ವರ್ಕ್‌ಫೋರ್ಸ್ ಸೊಲ್ಯೂಷನ್ಸ್ ಕಾರ್ಖಾನೆ ಮತ್ತು ಉತ್ಪಾದನಾ ಕೆಲಸಗಳಿಗೆ ಸಹಾಯ ಮಾಡುವ ಸಾಮಾನ್ಯ ಕಾರ್ಮಿಕರ ಹುದ್ದೆಗಳಿಗೆ ಅರ್ಜಿಗಳನ್ನು ಆಹ್ವಾನಿಸುತ್ತಿದೆ.

ಜವಾಬ್ದಾರಿಗಳು:
• ಮೇಲ್ವಿಚಾರಕರ ಸೂಚನೆಗಳಂತೆ ಉತ್ಪಾದನಾ ತಂಡದ ದಿನನಿತ್ಯದ ಕೆಲಸಗಳಿಗೆ ಸಹಾಯ ಮಾಡುವುದು.
• ಸಾಮಗ್ರಿಗಳನ್ನು ವಿಂಗಡಿಸಿ, ಪ್ಯಾಕಿಂಗ್‌ಗೆ ಸಿದ್ಧಪಡಿಸಿ, ಅಚ್ಚುಕಟ್ಟಾಗಿ ಜೋಡಿಸುವುದು.
• ನಿಗದಿತ ಕೆಲಸದ ಪ್ರದೇಶದಲ್ಲಿ ಪ್ಯಾಕಿಂಗ್, ಲೇಬಲ್ ಅಂಟಿಸುವಿಕೆ ಮತ್ತು ಸಾಮಗ್ರಿಗಳ ಸ್ಥಳಾಂತರಕ್ಕೆ ಸಹಾಯ ಮಾಡುವುದು.
• ವಸ್ತುಗಳಲ್ಲಿ ಕಾಣುವ ಹಾನಿ ಅಥವಾ ದೋಷಗಳನ್ನು ಗಮನಿಸಿ ಮೇಲ್ವಿಚಾರಕರಿಗೆ ತಿಳಿಸುವುದು.
• ಕೆಲಸದ ಪ್ರದೇಶವನ್ನು ಸ್ವಚ್ಛವಾಗಿರಿಸಿ, ಸುರಕ್ಷತಾ ಸೂಚನೆಗಳನ್ನು ಪಾಲಿಸುವುದು.

ಅಭ್ಯರ್ಥಿಗಳ ವಿವರ:
• ಅನುಭವವಿಲ್ಲದವರೂ ಅರ್ಜಿ ಸಲ್ಲಿಸಬಹುದು.
• ಹೊಸ ಕೆಲಸ ಕಲಿಯುವ ಆಸಕ್ತಿ, ಸೂಚನೆಗಳನ್ನು ಪಾಲಿಸುವ ಮತ್ತು ತಂಡದೊಂದಿಗೆ ಕೆಲಸ ಮಾಡುವ ಮನೋಭಾವ.
• ಸಾಮಗ್ರಿಗಳನ್ನು ಜಾಗರೂಕತೆಯಿಂದ ನಿರ್ವಹಿಸುವುದು, ಸಮಯಪಾಲನೆ ಮತ್ತು ಗುಣಮಟ್ಟದ ಕಡೆ ಗಮನ.

ನಿಮ್ಮ ಸಂಪರ್ಕ ವಿವರಗಳು ಮತ್ತು ಕೆಲಸಕ್ಕೆ ಸೇರಲು ಸಾಧ್ಯವಾಗುವ ಸಮಯದೊಂದಿಗೆ ಅರ್ಜಿ ಸಲ್ಲಿಸಿ. ನಿಖರವಾದ ಕೆಲಸದ ಜವಾಬ್ದಾರಿಗಳು ಮತ್ತು ಸೇರ್ಪಡೆ ವಿವರಗಳನ್ನು ನೇಮಕಾತಿ ತಂಡ ದೃಢಪಡಿಸುತ್ತದೆ.""",
    },
    {
        "id": "b067751c-ac62-40c6-88b7-1f06d6a43abe",
        "title": "Assembler",
        "description": """Brothers Workforce Solutions is inviting applications for Assembler roles in production. The work involves putting components together carefully and checking that completed items meet the work instructions.

Responsibilities:
• Identify the required parts and assemble components in the correct sequence.
• Follow the supervisor's instructions and the assembly process for each task.
• Use only the approved tools and equipment for which you have received instructions.
• Check assembled items for correct fit, missing parts and visible defects.
• Report quality issues, damaged parts or equipment problems promptly.
• Keep parts and the workstation organized and follow safety procedures.

Candidate profile:
• Freshers can apply.
• Attention to detail and willingness to learn assembly work.
• Ability to follow step-by-step instructions and coordinate with the production team.

Apply with your contact details and any relevant skills or experience. The recruitment team will explain the product, assembly tasks and joining arrangements for the opening.""",
        "description_kn": """ಬ್ರದರ್ಸ್ ವರ್ಕ್‌ಫೋರ್ಸ್ ಸೊಲ್ಯೂಷನ್ಸ್ ಉತ್ಪಾದನಾ ವಿಭಾಗದ ಅಸೆಂಬ್ಲರ್ ಹುದ್ದೆಗಳಿಗೆ ಅರ್ಜಿಗಳನ್ನು ಆಹ್ವಾನಿಸುತ್ತಿದೆ. ಬಿಡಿಭಾಗಗಳನ್ನು ಜಾಗರೂಕತೆಯಿಂದ ಜೋಡಿಸಿ, ಸಿದ್ಧವಾದ ವಸ್ತುಗಳು ಕೆಲಸದ ಸೂಚನೆಗಳಿಗೆ ತಕ್ಕಂತೆ ಇರುವುದನ್ನು ಪರಿಶೀಲಿಸುವುದು ಈ ಕೆಲಸದ ಭಾಗವಾಗಿದೆ.

ಜವಾಬ್ದಾರಿಗಳು:
• ಅಗತ್ಯ ಬಿಡಿಭಾಗಗಳನ್ನು ಗುರುತಿಸಿ ಸರಿಯಾದ ಕ್ರಮದಲ್ಲಿ ಜೋಡಿಸುವುದು.
• ಪ್ರತಿ ಕೆಲಸಕ್ಕೆ ನಿಗದಿಪಡಿಸಿದ ಜೋಡಣೆ ವಿಧಾನ ಮತ್ತು ಮೇಲ್ವಿಚಾರಕರ ಸೂಚನೆಗಳನ್ನು ಪಾಲಿಸುವುದು.
• ಬಳಕೆಯ ಸೂಚನೆಗಳನ್ನು ಪಡೆದಿರುವ ಅನುಮೋದಿತ ಉಪಕರಣಗಳನ್ನು ಮಾತ್ರ ಬಳಸುವುದು.
• ಜೋಡಿಸಿದ ವಸ್ತುಗಳ ಸರಿಯಾದ ಹೊಂದಾಣಿಕೆ, ತಪ್ಪಿದ ಭಾಗಗಳು ಮತ್ತು ಕಾಣುವ ದೋಷಗಳನ್ನು ಪರಿಶೀಲಿಸುವುದು.
• ಗುಣಮಟ್ಟದ ಸಮಸ್ಯೆ, ಹಾನಿಯಾದ ಭಾಗ ಅಥವಾ ಉಪಕರಣದ ಸಮಸ್ಯೆಯನ್ನು ತಕ್ಷಣ ತಿಳಿಸುವುದು.
• ಬಿಡಿಭಾಗಗಳು ಮತ್ತು ಕೆಲಸದ ಸ್ಥಳವನ್ನು ಅಚ್ಚುಕಟ್ಟಾಗಿ ಇರಿಸಿ, ಸುರಕ್ಷತಾ ವಿಧಾನಗಳನ್ನು ಪಾಲಿಸುವುದು.

ಅಭ್ಯರ್ಥಿಗಳ ವಿವರ:
• ಅನುಭವವಿಲ್ಲದವರೂ ಅರ್ಜಿ ಸಲ್ಲಿಸಬಹುದು.
• ಸಣ್ಣ ವಿವರಗಳ ಕಡೆ ಗಮನ ಮತ್ತು ಜೋಡಣೆ ಕೆಲಸ ಕಲಿಯುವ ಆಸಕ್ತಿ.
• ಹಂತ ಹಂತದ ಸೂಚನೆಗಳನ್ನು ಪಾಲಿಸಿ ಉತ್ಪಾದನಾ ತಂಡದೊಂದಿಗೆ ಕೆಲಸ ಮಾಡುವ ಸಾಮರ್ಥ್ಯ.

ನಿಮ್ಮ ಸಂಪರ್ಕ ವಿವರಗಳು ಮತ್ತು ಸಂಬಂಧಿತ ಕೌಶಲ್ಯ ಅಥವಾ ಅನುಭವದೊಂದಿಗೆ ಅರ್ಜಿ ಸಲ್ಲಿಸಿ. ಉತ್ಪನ್ನ, ಜೋಡಣೆ ಕೆಲಸ ಮತ್ತು ಸೇರ್ಪಡೆ ವಿವರಗಳನ್ನು ನೇಮಕಾತಿ ತಂಡ ತಿಳಿಸುತ್ತದೆ.""",
    },
    {
        "id": "a7e401ef-1694-4a29-9a8f-49cda242246b",
        "title": "ITI graduate",
        "description": """Brothers Workforce Solutions is inviting applications from ITI graduates for entry-level industrial opportunities. The specific production, assembly, machine-operation or maintenance support assignment will depend on your trade and the available opening.

Responsibilities:
• Apply the practical knowledge from your ITI trade to the assigned work.
• Follow work instructions and assist the production or technical team under supervision.
• Use tools, machines or measuring equipment only as instructed and authorized.
• Observe quality and safety requirements and report faults or unusual conditions.
• Keep tools and the work area organized and complete assigned work carefully.

Candidate profile:
• Fresh ITI graduates can apply; prior work experience is not required for this posting.
• Basic understanding of the tools and practices relevant to your ITI trade.
• Willingness to learn workplace processes and follow safety instructions.

Mention your ITI trade, qualification and practical skills when applying so the recruitment team can discuss the suitable assignment and joining arrangements.""",
        "description_kn": """ಬ್ರದರ್ಸ್ ವರ್ಕ್‌ಫೋರ್ಸ್ ಸೊಲ್ಯೂಷನ್ಸ್ ಆರಂಭಿಕ ಹಂತದ ಕೈಗಾರಿಕಾ ಉದ್ಯೋಗಾವಕಾಶಗಳಿಗಾಗಿ ಐಟಿಐ ಪದವೀಧರರಿಂದ ಅರ್ಜಿಗಳನ್ನು ಆಹ್ವಾನಿಸುತ್ತಿದೆ. ನಿಮ್ಮ ಟ್ರೇಡ್ ಮತ್ತು ಲಭ್ಯವಿರುವ ಹುದ್ದೆಗೆ ಅನುಗುಣವಾಗಿ ಉತ್ಪಾದನೆ, ಜೋಡಣೆ, ಯಂತ್ರ ಕಾರ್ಯಾಚರಣೆ ಅಥವಾ ನಿರ್ವಹಣಾ ಸಹಾಯಕ ಕೆಲಸವನ್ನು ನಿಗದಿಪಡಿಸಲಾಗುತ್ತದೆ.

ಜವಾಬ್ದಾರಿಗಳು:
• ನಿಮ್ಮ ಐಟಿಐ ಟ್ರೇಡ್‌ನಲ್ಲಿ ಕಲಿತ ಪ್ರಾಯೋಗಿಕ ಜ್ಞಾನವನ್ನು ನಿಗದಿತ ಕೆಲಸದಲ್ಲಿ ಬಳಸುವುದು.
• ಕೆಲಸದ ಸೂಚನೆಗಳನ್ನು ಪಾಲಿಸಿ, ಮೇಲ್ವಿಚಾರಣೆಯಲ್ಲಿ ಉತ್ಪಾದನಾ ಅಥವಾ ತಾಂತ್ರಿಕ ತಂಡಕ್ಕೆ ಸಹಾಯ ಮಾಡುವುದು.
• ಸೂಚನೆ ಮತ್ತು ಅನುಮತಿ ಪಡೆದಂತೆ ಮಾತ್ರ ಉಪಕರಣ, ಯಂತ್ರ ಅಥವಾ ಅಳತೆ ಸಾಧನಗಳನ್ನು ಬಳಸುವುದು.
• ಗುಣಮಟ್ಟ ಮತ್ತು ಸುರಕ್ಷತಾ ನಿಯಮಗಳನ್ನು ಪಾಲಿಸಿ, ದೋಷ ಅಥವಾ ಅಸಾಮಾನ್ಯ ಪರಿಸ್ಥಿತಿಯನ್ನು ತಿಳಿಸುವುದು.
• ಉಪಕರಣಗಳು ಮತ್ತು ಕೆಲಸದ ಪ್ರದೇಶವನ್ನು ಅಚ್ಚುಕಟ್ಟಾಗಿ ಇರಿಸಿ, ನೀಡಿದ ಕೆಲಸವನ್ನು ಜಾಗರೂಕತೆಯಿಂದ ಪೂರ್ಣಗೊಳಿಸುವುದು.

ಅಭ್ಯರ್ಥಿಗಳ ವಿವರ:
• ಹೊಸ ಐಟಿಐ ಪದವೀಧರರೂ ಅರ್ಜಿ ಸಲ್ಲಿಸಬಹುದು; ಈ ಪ್ರಕಟಣೆಗೆ ಹಿಂದಿನ ಕೆಲಸದ ಅನುಭವ ಅಗತ್ಯವಿಲ್ಲ.
• ತಮ್ಮ ಐಟಿಐ ಟ್ರೇಡ್‌ಗೆ ಸಂಬಂಧಿಸಿದ ಉಪಕರಣಗಳು ಮತ್ತು ಕೆಲಸದ ವಿಧಾನಗಳ ಮೂಲಭೂತ ತಿಳುವಳಿಕೆ.
• ಕೆಲಸದ ಪ್ರಕ್ರಿಯೆಗಳನ್ನು ಕಲಿಯುವ ಆಸಕ್ತಿ ಮತ್ತು ಸುರಕ್ಷತಾ ಸೂಚನೆಗಳನ್ನು ಪಾಲಿಸುವ ಮನೋಭಾವ.

ಅರ್ಜಿ ಸಲ್ಲಿಸುವಾಗ ನಿಮ್ಮ ಐಟಿಐ ಟ್ರೇಡ್, ವಿದ್ಯಾರ್ಹತೆ ಮತ್ತು ಪ್ರಾಯೋಗಿಕ ಕೌಶಲ್ಯಗಳನ್ನು ತಿಳಿಸಿ. ಸೂಕ್ತ ಕೆಲಸ ಮತ್ತು ಸೇರ್ಪಡೆ ವಿವರಗಳ ಕುರಿತು ನೇಮಕಾತಿ ತಂಡ ಚರ್ಚಿಸುತ್ತದೆ.""",
    },
)


def missing_description(field: str) -> dict:
    return {"$or": [{field: None}, {field: {"$regex": r"^\s*$"}}]}


async def fill_missing_job_descriptions(db) -> dict:
    counts = {"descriptions_added": 0, "translations_added": 0}
    for post in JOB_DESCRIPTIONS:
        identity = {
            "id": post["id"],
            "title": {"$regex": rf"^\s*{re.escape(post['title'])}\s*$", "$options": "i"},
        }
        result = await db.jobs.update_one(
            {**identity, **missing_description("description")},
            {"$set": {"description": post["description"], "updated_at": datetime.now(timezone.utc)}},
        )
        counts["descriptions_added"] += result.modified_count
        # Matching the generated English also makes a retry safe if startup stopped
        # between the two writes. Never replace an administrator's wording.
        result = await db.jobs.update_one(
            {**identity, "description": post["description"], **missing_description("description_kn")},
            {"$set": {"description_kn": post["description_kn"], "updated_at": datetime.now(timezone.utc)}},
        )
        counts["translations_added"] += result.modified_count
    return counts
