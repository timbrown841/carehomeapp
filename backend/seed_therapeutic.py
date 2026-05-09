"""Safelyn Systems · Therapeutic Practice seed data.

This module is the SINGLE source of truth for static therapeutic content
(frameworks / resource packs / key-work topics / guided prompts) seeded into
MongoDB at startup. Content is intentionally guidance-based, not prescriptive.

PRINCIPLE — quoted from product spec:
    "The system should support and guide staff practice — not replace
    professional judgement. Avoid fully AI-generated therapeutic content."

Each item has a stable `id` so we can re-run the seeder idempotently.
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Frameworks
# ---------------------------------------------------------------------------

FRAMEWORKS = [
    {
        "id": "bronfenbrenner",
        "name": "Bronfenbrenner's Ecological Systems Theory",
        "short_name": "Ecological Systems",
        "theorist": "Urie Bronfenbrenner",
        "summary": (
            "A child's development is shaped by nested systems of influence: "
            "their immediate microsystem (family, home, school, peers), the "
            "mesosystem connecting these, the exosystem (parent's work, "
            "neighbourhood, services), the macrosystem (culture, policy) and "
            "the chronosystem (time, life events)."
        ),
        "key_concepts": [
            {"label": "Microsystem", "body": "Direct relationships — placement staff, family contact, school, friends. Where day-to-day support happens."},
            {"label": "Mesosystem", "body": "How microsystems interact. E.g. how the relationship between home and school affects engagement."},
            {"label": "Exosystem", "body": "Indirect influences — social-worker caseload, school resources, community provision."},
            {"label": "Macrosystem", "body": "Culture, legislation, austerity, social attitudes — the wider 'water we swim in'."},
            {"label": "Chronosystem", "body": "Significant life events and transitions over time — placement moves, loss, key birthdays."},
        ],
        "when_to_use": [
            "Mapping a young person's protective and risk factors holistically.",
            "Risk assessments — what's happening *around* the young person, not just within them.",
            "Planning transitions (placement moves, school changes, leaving care).",
        ],
        "cautions": [
            "Don't reduce a young person to 'their environment'. Always centre their voice and agency.",
            "Mapping is a tool, not a diagnosis — review with the young person where appropriate.",
        ],
        "references": ["Bronfenbrenner (1979) The Ecology of Human Development"],
    },
    {
        "id": "attachment",
        "name": "Attachment Theory",
        "short_name": "Attachment",
        "theorist": "John Bowlby & Mary Ainsworth",
        "summary": (
            "Children form internal working models of relationships through "
            "early caregiving. Patterns can be secure, anxious, avoidant or "
            "disorganised. For care-experienced young people, relationships "
            "with consistent adults can re-pattern these models over time."
        ),
        "key_concepts": [
            {"label": "Secure base", "body": "A trusted adult who supports exploration and provides comfort when needed."},
            {"label": "Internal working models", "body": "Beliefs about whether others are reliable / one is worthy of care — formed early, revisable."},
            {"label": "Disorganised attachment", "body": "When a caregiver was the source of fear AND comfort — common in trauma. Behaviour can look unpredictable."},
            {"label": "Earned security", "body": "The therapeutic relationship can be 'corrective' — consistent, predictable, attuned care matters."},
        ],
        "when_to_use": [
            "Building relationships with new placements.",
            "Understanding 'pushing away' or 'pulling in too hard' as relational patterns, not deliberate behaviour.",
            "Planning consistent staff allocation and key-work pairings.",
        ],
        "cautions": [
            "Attachment styles are descriptive, not labels. Avoid 'they're attachment-disordered'.",
            "Re-patterning takes years — celebrate small wins.",
        ],
        "references": ["Bowlby (1969) Attachment", "Ainsworth Strange Situation"],
    },
    {
        "id": "trauma_informed",
        "name": "Trauma-Informed Practice",
        "short_name": "Trauma-Informed",
        "theorist": "SAMHSA / Bessel van der Kolk / Bruce Perry",
        "summary": (
            "Recognises that many behaviours from care-experienced young people "
            "are adaptive responses to trauma. Practice shifts from 'What is "
            "wrong with you?' to 'What happened to you?' — emphasising safety, "
            "trustworthiness, choice, collaboration, and empowerment."
        ),
        "key_concepts": [
            {"label": "Window of tolerance", "body": "Each person's emotional regulation range. Trauma narrows it. Co-regulation widens it over time."},
            {"label": "Triggers", "body": "Specific cues — sounds, words, anniversaries — that move someone outside their window."},
            {"label": "Hypo / hyper-arousal", "body": "Shutting down (frozen, vacant) vs ramping up (fight/flight). Both are trauma responses."},
            {"label": "Safety, Trust, Choice, Collaboration, Empowerment", "body": "The five SAMHSA principles — practical, day-to-day."},
        ],
        "when_to_use": [
            "Most young people in residential care have experienced trauma — assume unless told otherwise.",
            "Behaviour escalations: ask 'what's the trigger?' before 'what's the consequence?'.",
            "Routines, predictability and warning of changes reduce re-traumatisation.",
        ],
        "cautions": [
            "'Trauma-informed' is a practice posture, not a therapy. Refer to specialist clinicians for trauma processing.",
            "Avoid 're-storying' a young person's experience — let them lead.",
        ],
        "references": ["SAMHSA (2014) Concept of Trauma", "van der Kolk: The Body Keeps the Score"],
    },
    {
        "id": "contextual_safeguarding",
        "name": "Contextual Safeguarding",
        "short_name": "Contextual Safeguarding",
        "theorist": "Carlene Firmin",
        "summary": (
            "Safeguarding response that recognises young people experience harm "
            "in extra-familial contexts — peer groups, schools, neighbourhoods, "
            "online spaces. Risk and protection sit OUTSIDE the home as much as "
            "within it."
        ),
        "key_concepts": [
            {"label": "Extra-familial harm", "body": "Exploitation, peer-on-peer abuse, gangs, online grooming, neighbourhood violence."},
            {"label": "Context mapping", "body": "Map the locations, peers, online spaces where harm and protection sit. Update regularly."},
            {"label": "Protective contexts", "body": "Identify where the young person feels safe — youth clubs, particular school staff, online communities."},
            {"label": "Disrupting the context", "body": "Intervention may target the place / peers / online space, not just the young person."},
        ],
        "when_to_use": [
            "Missing-from-care follow-ups — where were they, who were they with, why those places?",
            "Risk assessments must include extra-familial mapping, not only home dynamics.",
            "When patterns suggest exploitation, gang affiliation or online harm.",
        ],
        "cautions": [
            "Don't 'criminalise' the young person — disrupt the context, not them.",
            "Information sharing must be lawful and proportionate. Liaise with police / LA appropriately.",
        ],
        "references": ["Firmin (2020) Contextual Safeguarding and Child Protection"],
    },
    {
        "id": "pace",
        "name": "PACE approach",
        "short_name": "PACE",
        "theorist": "Dan Hughes",
        "summary": (
            "A relational stance for working with traumatised children — "
            "Playfulness, Acceptance, Curiosity, Empathy. The opposite of "
            "judgement and consequence-first responses."
        ),
        "key_concepts": [
            {"label": "Playfulness", "body": "Light-hearted connection regulates the nervous system. Not joking AT a young person."},
            {"label": "Acceptance", "body": "Accept the young person's inner experience as it is — even when behaviour is not OK."},
            {"label": "Curiosity", "body": "Wonder aloud about what's underneath behaviour, without interrogation."},
            {"label": "Empathy", "body": "Communicate understanding of how it feels to BE them, right now."},
        ],
        "when_to_use": [
            "Day-to-day relational work with traumatised young people.",
            "After incidents — repair conversations.",
            "Key-work sessions — especially with avoidant or shut-down young people.",
        ],
        "cautions": [
            "PACE is not permissiveness — boundaries still apply.",
            "Curiosity ≠ interrogation. If the young person resists, drop it.",
        ],
        "references": ["Hughes & Golding (2012) Creating Loving Attachments"],
    },
    {
        "id": "restorative",
        "name": "Restorative Practice",
        "short_name": "Restorative",
        "theorist": "Howard Zehr / IIRP",
        "summary": (
            "Approach to harm and conflict that focuses on relationships, "
            "harm done, and what's needed to repair it — rather than rules "
            "broken and consequences imposed."
        ),
        "key_concepts": [
            {"label": "Restorative questions", "body": "What happened? What were you thinking? Who was affected? What's needed to put it right?"},
            {"label": "Affective statements", "body": "Use 'I felt…' rather than 'you did…'. Models emotional vocabulary."},
            {"label": "Restorative conferences", "body": "Structured conversation between those who caused and were affected by harm."},
            {"label": "Fair process", "body": "Engagement, explanation, expectation clarity — perceived fairness reduces escalation."},
        ],
        "when_to_use": [
            "After peer-on-peer incidents in the home.",
            "Reintegration after a missing episode.",
            "Repair after staff-young-person rupture.",
        ],
        "cautions": [
            "Not appropriate where there's ongoing power imbalance, exploitation, or risk of further harm.",
            "Both parties must be willing — never compel.",
        ],
        "references": ["Zehr (2015) The Little Book of Restorative Justice"],
    },
    {
        "id": "maslow",
        "name": "Maslow's Hierarchy of Needs",
        "short_name": "Maslow",
        "theorist": "Abraham Maslow",
        "summary": (
            "Human needs ordered from physiological (food, sleep, safety) "
            "through belonging and esteem to self-actualisation. Until lower "
            "needs are met, higher work struggles to land."
        ),
        "key_concepts": [
            {"label": "Physiological", "body": "Sleep, food, warmth, comfort — never assume these are 'sorted'."},
            {"label": "Safety", "body": "Physical AND emotional safety — predictability, consistent staff."},
            {"label": "Belonging", "body": "Felt sense of being part of the home, the school, the team."},
            {"label": "Esteem", "body": "Competence, recognition, achievement — visible wins."},
            {"label": "Self-actualisation", "body": "Identity, purpose, meaning — long-term work."},
        ],
        "when_to_use": [
            "Care planning checklist — what unmet need might be driving behaviour today?",
            "Onboarding a new placement — start at physiological + safety.",
            "When goals feel 'stuck' — check if you're working at the wrong level.",
        ],
        "cautions": [
            "Not strictly linear in real life — needs overlap and shift daily.",
            "A model, not a prescription.",
        ],
        "references": ["Maslow (1943) A Theory of Human Motivation"],
    },
    {
        "id": "social_learning",
        "name": "Social Learning Theory",
        "short_name": "Social Learning",
        "theorist": "Albert Bandura",
        "summary": (
            "People learn behaviours, attitudes and emotional reactions by "
            "observing others — especially adults and peers they identify with. "
            "Modelling is one of the most powerful tools in residential practice."
        ),
        "key_concepts": [
            {"label": "Modelling", "body": "Staff demonstrate emotional regulation, conflict repair, asking for help — visibly and out loud."},
            {"label": "Self-efficacy", "body": "Belief 'I can do this' — built by graded successes and recognition."},
            {"label": "Observational learning", "body": "Young people watch how staff handle stress, mistakes, peers — more than they hear what we say."},
            {"label": "Reciprocal determinism", "body": "Person ↔ behaviour ↔ environment all influence each other — change any one to shift the system."},
        ],
        "when_to_use": [
            "Independence skills — model out loud, don't just instruct.",
            "Emotional regulation — narrate your own ('I'm noticing I'm getting frustrated, let me…').",
            "Building self-efficacy in education re-engagement, household tasks, social skills.",
        ],
        "cautions": [
            "Beware modelling unhelpful patterns under stress — staff supervision matters.",
            "Peer modelling can go either way — pay attention to who is being modelled.",
        ],
        "references": ["Bandura (1977) Social Learning Theory"],
    },
    {
        "id": "child_development",
        "name": "Child Development Frameworks",
        "short_name": "Child Development",
        "theorist": "Piaget · Erikson · Vygotsky",
        "summary": (
            "Developmental science gives us age-typical milestones in "
            "cognitive, social, emotional and identity development — and a "
            "language for where a young person is right now versus their "
            "chronological age."
        ),
        "key_concepts": [
            {"label": "Developmental age vs chronological age", "body": "Trauma can leave young people developmentally younger in some areas. Match support to developmental need."},
            {"label": "Erikson — identity vs role confusion", "body": "Adolescence is the identity-formation stage. Care-experienced YPs have extra identity work."},
            {"label": "Vygotsky — zone of proximal development", "body": "The 'just stretch' zone where growth happens — too easy bores, too hard shuts down."},
            {"label": "Adolescent brain", "body": "Prefrontal cortex still developing into mid-20s — risk-taking and emotional reactivity is biology, not 'choice'."},
        ],
        "when_to_use": [
            "Understanding why a 16-year-old behaves like a younger child in some moments.",
            "Pitching support plan goals into the young person's stretch zone, not panic zone.",
            "Identity work in adolescence — name, story, family, belonging.",
        ],
        "cautions": [
            "Don't infantilise — match support to need without losing dignity.",
            "Developmental trauma is not 'pretending'. It's real.",
        ],
        "references": ["Erikson (1968)", "Vygotsky (1978)"],
    },
]


# ---------------------------------------------------------------------------
# Resource packs
# ---------------------------------------------------------------------------

def _section(stype, title, body):
    return {"type": stype, "title": title, "body": body}


RESOURCE_PACKS = [
    {
        "id": "rp_ebd",
        "theme": "ebd",
        "title": "Working with Emotional & Behavioural Differences",
        "summary": "Practical session ideas and reflection prompts for young people with EBD-type presentations. Focus on co-regulation, predictability, repair.",
        "age_range": "10–18",
        "evidence_base": "Trauma-informed; PACE; CAMHS guidance",
        "related_framework_ids": ["trauma_informed", "pace", "attachment"],
        "sections": [
            _section("session_idea", "The 'Calm Box'", "Co-create a personal calm box together: items that soothe (smell, texture, photo, music). Use it before crises, not after."),
            _section("session_idea", "Window of Tolerance map", "Draw a thermometer together. Label what 'OK', 'getting hot' and 'flipped lid' feel like — physically. Ask what helps drop the temperature."),
            _section("activity", "Naming the feeling", "Use a feelings wheel. Each day for a week, the young person points to where they're at. Look for patterns."),
            _section("worksheet", "My triggers, my strategies", "Two columns. Left: things that wind me up. Right: what I do that helps. Revisit monthly."),
            _section("reflection_prompt", "Staff reflection", "After each escalation, ask yourself: was my voice / pace / proximity helping or hurting? What would I do differently?"),
            _section("discussion_prompt", "Repair conversation", "'I noticed yesterday was hard. I wasn't here to make it harder. What would have helped?'"),
        ],
    },
    {
        "id": "rp_trauma",
        "theme": "trauma",
        "title": "Trauma Awareness for Care Staff",
        "summary": "Build a trauma-informed mindset in everyday interactions. Not therapy — daily care.",
        "age_range": "All",
        "evidence_base": "SAMHSA; van der Kolk; Perry's Neurosequential Model",
        "related_framework_ids": ["trauma_informed", "attachment", "pace"],
        "sections": [
            _section("reflection_prompt", "What happened to them, not what's wrong with them", "Pick one behaviour you find hardest. Write down 3 possible 'what happened to them' explanations. Share with your supervisor."),
            _section("session_idea", "Safe-space mapping", "Together, map the rooms / places / times of day the young person feels safest. Make a plan to extend those moments."),
            _section("worksheet", "My anniversary calendar", "Significant dates the young person wants staff to know about (carefully held, optional). Put quiet support in place around them."),
            _section("discussion_prompt", "Staff handover prompt", "Before passing on a difficult shift, name one trauma-informed insight you want the next person to hold."),
            _section("activity", "5-4-3-2-1 grounding", "When dysregulated: name 5 things you see, 4 you hear, 3 you touch, 2 you smell, 1 you taste. Co-regulate, don't lecture."),
        ],
    },
    {
        "id": "rp_emotional_regulation",
        "theme": "emotional_regulation",
        "title": "Emotional Regulation Toolkit",
        "summary": "Practical co-regulation and self-regulation tools for daily use.",
        "age_range": "8–18",
        "evidence_base": "DBT-informed; trauma-informed",
        "related_framework_ids": ["trauma_informed", "pace", "social_learning"],
        "sections": [
            _section("activity", "Box breathing", "In 4, hold 4, out 4, hold 4. Practice when calm so it's available when stressed."),
            _section("session_idea", "Volcano scale", "Together, draw a 1-10 scale of anger/upset. Talk through what happens at each level. Identify intervention points before the explosion."),
            _section("worksheet", "STOPP card", "Stop · Take a breath · Observe what's happening · Pull back — what would a wise version of me do? · Practice what works."),
            _section("reflection_prompt", "Co-regulation review", "End of shift: when did I co-regulate well today? When did I add fuel? What changed it?"),
            _section("discussion_prompt", "Naming the win", "When the young person regulated themselves: notice it out loud, specifically. Don't make it weird."),
        ],
    },
    {
        "id": "rp_cse",
        "theme": "exploitation",
        "title": "Child Exploitation Awareness Pack",
        "summary": "Recognise grooming, exploitation indicators, and act without making the young person feel blamed.",
        "age_range": "11–18",
        "evidence_base": "Working Together 2023; Contextual Safeguarding; CSE Practice Guidance",
        "related_framework_ids": ["contextual_safeguarding", "trauma_informed"],
        "sections": [
            _section("reflection_prompt", "Recognising indicators", "Unexplained money / phones, older 'friends', secrecy about location, going missing repeatedly, signs of substance use, sexualised behaviour. Any in last 30 days?"),
            _section("discussion_prompt", "Talking about online relationships", "'Tell me about your online friends — what do you like about them?' Curious, not interrogative. PACE stance."),
            _section("session_idea", "Healthy vs harmful relationships", "Use Brook's traffic-light tool together — what's green / amber / red in a relationship."),
            _section("activity", "What's grooming?", "Go through age-appropriate grooming-awareness video together. Discuss WITHOUT lecturing. Listen for what comes up."),
            _section("worksheet", "Trusted adult list", "Help the young person list 5 trusted adults they could go to. Practice 'I need to tell you something' starter sentence."),
        ],
    },
    {
        "id": "rp_mfc_prevention",
        "theme": "missing_from_care_prevention",
        "title": "Reducing Missing-From-Care Episodes",
        "summary": "Pre-emptive practice to reduce risk of going missing — relational, contextual, and systemic.",
        "age_range": "10–18",
        "evidence_base": "Contextual Safeguarding; Children's Society research",
        "related_framework_ids": ["contextual_safeguarding", "attachment", "trauma_informed"],
        "sections": [
            _section("reflection_prompt", "Why are they leaving?", "Going TO something or AWAY from something? Map both. Different responses needed."),
            _section("discussion_prompt", "Push & pull conversation", "'When you go, what does it give you that being here doesn't?' Listen carefully — answers can guide the support plan."),
            _section("session_idea", "Pre-agreed return plan", "When you DO leave, here's what we'll agree: text every X hours, agreed safe person, agreed return time. Better than absolutism."),
            _section("worksheet", "My safety plan if I go", "Co-create with the young person — keys, money, phone charged, safe contacts, what to do if it gets unsafe."),
            _section("activity", "Repair on return", "Cup of tea first. PACE conversation. Don't lead with consequences."),
        ],
    },
    {
        "id": "rp_identity",
        "theme": "identity_self_esteem",
        "title": "Identity & Self-Esteem",
        "summary": "Identity work for care-experienced young people — story, belonging, name, body, faith, race, sexuality.",
        "age_range": "12–18",
        "evidence_base": "Erikson; care-experienced young people's research; identity-affirming practice",
        "related_framework_ids": ["child_development", "attachment"],
        "sections": [
            _section("session_idea", "My life story", "Co-create a timeline of significant moments — good and hard. Use only what they want to share. Some have memory gaps; honour that."),
            _section("activity", "Strengths jar", "Write one strength a week on a slip of paper. Put it in a jar. Read on bad days."),
            _section("discussion_prompt", "Heritage & belonging", "Race, faith, language, food, family of origin, family of choice. What does belonging mean to you?"),
            _section("worksheet", "I am…", "Sentence starters: I am proud of… / I'm getting better at… / I'd like more of… / I wish people knew…"),
            _section("reflection_prompt", "Mirroring", "Notice strengths out loud, specifically, daily. They will eventually mirror what they hear."),
        ],
    },
    {
        "id": "rp_relationships",
        "theme": "healthy_relationships",
        "title": "Healthy Relationships Pack",
        "summary": "Help young people build a felt sense of what healthy looks like — friendship, romance, family.",
        "age_range": "12–18",
        "evidence_base": "Brook traffic-light; Restorative Practice",
        "related_framework_ids": ["restorative", "social_learning", "attachment"],
        "sections": [
            _section("session_idea", "Relationship map", "Draw concentric circles. Place people. Discuss what makes someone closer / further."),
            _section("activity", "Consent & respect", "Use Brook's tools to discuss consent age-appropriately. Listen more than teach."),
            _section("discussion_prompt", "Conflict repair", "'Can we go back to that argument? I want to understand what happened for you.' Restorative stance."),
            _section("worksheet", "Green / amber / red flags", "List signs across friendships, online, romantic, family. Personalised, not generic."),
            _section("reflection_prompt", "Modelling staff", "Do the young people see staff disagree well, repair, ask for help? They learn from the team's relationships."),
        ],
    },
    {
        "id": "rp_independence",
        "theme": "independence_skills",
        "title": "Independence Skills Pack",
        "summary": "Practical living skills, personal admin, money, transport, cooking — taught with dignity.",
        "age_range": "14+",
        "evidence_base": "Pathway Plan guidance; Care Leaver standards",
        "related_framework_ids": ["social_learning", "child_development", "maslow"],
        "sections": [
            _section("session_idea", "Cooking together", "One meal a week, planned, shopped, cooked together. Talk while you chop. The session is the conversation."),
            _section("worksheet", "Money basics tracker", "Income, essentials, fun, savings — week by week. Real numbers, not abstract."),
            _section("activity", "Public transport practice", "Plan a journey together using the TfL / local app. Walk-through then do-together then do-alone."),
            _section("discussion_prompt", "Adulting failures are OK", "'Tell me about a time I messed something up as a young adult.' Normalise mistakes."),
            _section("reflection_prompt", "Pace", "Where are they on each skill — observed / supported / independent? Don't rush to independent before observed and supported are real."),
        ],
    },
    {
        "id": "rp_education",
        "theme": "education_engagement",
        "title": "Education Re-engagement Pack",
        "summary": "Support young people who have disengaged from education — re-build the relationship before the curriculum.",
        "age_range": "11–18",
        "evidence_base": "PEP guidance; Inclusion practice; trauma-informed school approaches",
        "related_framework_ids": ["maslow", "child_development", "attachment"],
        "sections": [
            _section("session_idea", "School story", "What did you love about school? What got hard? What would help now? Listen first."),
            _section("activity", "Small daily wins", "Book reading 15 min. One online module. Walk past the school gate. Build the muscle gradually."),
            _section("discussion_prompt", "Conversation with school", "Together with the young person, prep what we want to say at the next school meeting. Give them the words."),
            _section("worksheet", "PEP goals — my version", "Translate the PEP goals into the young person's words. Make it theirs."),
            _section("reflection_prompt", "Relationship before curriculum", "Have we built a steady, predictable adult-young-person learning relationship before pushing content? If not, slow down."),
        ],
    },
]


# ---------------------------------------------------------------------------
# Key Work Topics
# ---------------------------------------------------------------------------

KEY_WORK_TOPICS = [
    {
        "id": "topic_emotional_regulation",
        "label": "Emotional regulation",
        "category": "emotional_regulation",
        "description": "Co-regulation, naming feelings, building self-regulation tools.",
        "default_frameworks": ["trauma_informed", "pace", "social_learning"],
        "default_resource_pack_ids": ["rp_emotional_regulation", "rp_ebd"],
        "default_prompt_ids": ["p_triggers", "p_emotional_strategies", "p_yp_voice"],
    },
    {
        "id": "topic_relationships_friendship",
        "label": "Friendships & peer relationships",
        "category": "relationships",
        "description": "Healthy vs harmful, repair, peer pressure, online relationships.",
        "default_frameworks": ["restorative", "social_learning", "contextual_safeguarding"],
        "default_resource_pack_ids": ["rp_relationships"],
        "default_prompt_ids": ["p_protective_relationships", "p_contextual_risks", "p_yp_voice"],
    },
    {
        "id": "topic_education",
        "label": "Education engagement",
        "category": "education",
        "description": "PEP, school re-engagement, learning identity.",
        "default_frameworks": ["maslow", "child_development", "attachment"],
        "default_resource_pack_ids": ["rp_education"],
        "default_prompt_ids": ["p_yp_voice", "p_strengths"],
    },
    {
        "id": "topic_identity_self_esteem",
        "label": "Identity & self-esteem",
        "category": "identity",
        "description": "Story, belonging, race, faith, body, name.",
        "default_frameworks": ["child_development", "attachment", "social_learning"],
        "default_resource_pack_ids": ["rp_identity"],
        "default_prompt_ids": ["p_strengths", "p_yp_voice"],
    },
    {
        "id": "topic_safeguarding_exploitation",
        "label": "Safeguarding & exploitation awareness",
        "category": "safeguarding",
        "description": "CSE, gangs, online harm, contextual safeguarding.",
        "default_frameworks": ["contextual_safeguarding", "trauma_informed"],
        "default_resource_pack_ids": ["rp_cse", "rp_mfc_prevention"],
        "default_prompt_ids": ["p_contextual_risks", "p_protective_relationships", "p_trauma_triggers"],
    },
    {
        "id": "topic_missing_prevention",
        "label": "Missing-from-care prevention",
        "category": "safeguarding",
        "description": "Push/pull, return planning, repair on return.",
        "default_frameworks": ["contextual_safeguarding", "attachment", "trauma_informed"],
        "default_resource_pack_ids": ["rp_mfc_prevention"],
        "default_prompt_ids": ["p_contextual_risks", "p_protective_relationships", "p_yp_voice"],
    },
    {
        "id": "topic_independence",
        "label": "Independence skills",
        "category": "independence",
        "description": "Money, cooking, transport, personal admin, adulting.",
        "default_frameworks": ["social_learning", "child_development", "maslow"],
        "default_resource_pack_ids": ["rp_independence"],
        "default_prompt_ids": ["p_strengths", "p_yp_voice"],
    },
    {
        "id": "topic_wellbeing",
        "label": "Wellbeing & mental health",
        "category": "wellbeing",
        "description": "Sleep, mood, anxiety, professional support pathways.",
        "default_frameworks": ["trauma_informed", "maslow", "pace"],
        "default_resource_pack_ids": ["rp_emotional_regulation", "rp_trauma"],
        "default_prompt_ids": ["p_trauma_triggers", "p_emotional_strategies", "p_yp_voice"],
    },
    {
        "id": "topic_repair",
        "label": "Repair after rupture",
        "category": "wellbeing",
        "description": "Restorative conversation after an incident.",
        "default_frameworks": ["restorative", "pace", "trauma_informed"],
        "default_resource_pack_ids": ["rp_ebd", "rp_emotional_regulation"],
        "default_prompt_ids": ["p_yp_voice", "p_emotional_strategies"],
    },
]


# ---------------------------------------------------------------------------
# Guided Prompts (woven into key work, risk assessment, support plan flows)
# ---------------------------------------------------------------------------

GUIDED_PROMPTS = [
    {
        "id": "p_contextual_risks",
        "text": "What contextual risks are present in the young person's wider environment (peers, locations, online)?",
        "context": ["key_work_planning", "key_work_recording", "risk_assessment"],
        "theme_tags": ["contextual_safeguarding", "exploitation", "missing"],
        "linked_framework_ids": ["contextual_safeguarding"],
    },
    {
        "id": "p_protective_relationships",
        "text": "What protective relationships does the young person have? (Adults, peers, professionals — name them.)",
        "context": ["key_work_planning", "key_work_recording", "risk_assessment", "support_plan"],
        "theme_tags": ["attachment", "contextual_safeguarding", "peer_relationships"],
        "linked_framework_ids": ["attachment", "bronfenbrenner"],
    },
    {
        "id": "p_trauma_triggers",
        "text": "What trauma triggers should staff be aware of, and how does the young person move outside their window of tolerance?",
        "context": ["key_work_planning", "key_work_recording", "risk_assessment", "support_plan"],
        "theme_tags": ["trauma", "emotional_regulation"],
        "linked_framework_ids": ["trauma_informed"],
    },
    {
        "id": "p_yp_voice",
        "text": "How is the young person's voice reflected here? What did they actually say?",
        "context": ["key_work_planning", "key_work_recording", "risk_assessment", "support_plan"],
        "theme_tags": ["wellbeing", "identity", "education"],
        "linked_framework_ids": ["pace", "child_development"],
    },
    {
        "id": "p_emotional_strategies",
        "text": "What emotional regulation strategies are in place — co-regulation, self-soothing, named techniques? How are staff supporting them?",
        "context": ["key_work_planning", "key_work_recording", "support_plan"],
        "theme_tags": ["emotional_regulation", "trauma"],
        "linked_framework_ids": ["trauma_informed", "pace"],
    },
    {
        "id": "p_strengths",
        "text": "What strengths and protective factors are visible — at home, at school, with friends, in the community?",
        "context": ["key_work_planning", "key_work_recording", "support_plan"],
        "theme_tags": ["identity", "wellbeing"],
        "linked_framework_ids": ["maslow", "social_learning"],
    },
    {
        "id": "p_triggers",
        "text": "What specific situations / cues / times of day reliably escalate behaviour? What's the pattern?",
        "context": ["key_work_planning", "key_work_recording", "risk_assessment"],
        "theme_tags": ["trauma", "emotional_regulation"],
        "linked_framework_ids": ["trauma_informed"],
    },
    {
        "id": "p_unmet_need",
        "text": "Which of Maslow's levels feels unmet right now — physiological, safety, belonging, esteem? What would close the gap?",
        "context": ["key_work_planning", "support_plan", "risk_assessment"],
        "theme_tags": ["wellbeing"],
        "linked_framework_ids": ["maslow"],
    },
    {
        "id": "p_developmental_age",
        "text": "Where is the young person developmentally vs chronologically — emotionally, socially, cognitively? Are we pitching support to where they ARE?",
        "context": ["key_work_planning", "support_plan"],
        "theme_tags": ["identity", "education"],
        "linked_framework_ids": ["child_development"],
    },
    {
        "id": "p_repair",
        "text": "What repair has happened (or is needed) after the most recent rupture / incident?",
        "context": ["key_work_planning", "key_work_recording"],
        "theme_tags": ["emotional_regulation", "peer_relationships"],
        "linked_framework_ids": ["restorative", "pace"],
    },
    {
        "id": "p_modelling",
        "text": "What are staff modelling consistently this week — emotional regulation, repair, asking for help, healthy relationships? What's the team agreement?",
        "context": ["key_work_planning", "support_plan"],
        "theme_tags": ["emotional_regulation", "peer_relationships"],
        "linked_framework_ids": ["social_learning"],
    },
    {
        "id": "p_chronosystem",
        "text": "Are there significant dates / anniversaries / transitions coming up that might affect the young person?",
        "context": ["key_work_planning", "risk_assessment", "support_plan"],
        "theme_tags": ["trauma", "identity"],
        "linked_framework_ids": ["bronfenbrenner", "trauma_informed"],
    },
]
