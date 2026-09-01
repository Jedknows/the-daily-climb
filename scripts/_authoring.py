# Shared helper for the question seed files. Each question is authored as a
# dict of tier -> list of answers; an answer is either "Name" or
# ("Name", "quip") or ("Name", "quip", ["alias", ...]). This keeps the seed
# files readable while the emitted JSON stays the compact tuple form the
# build script consumes.
import json, os, sys

TIERS = ["dust", "tooclever", "flocker", "rare", "farout", "astronomical"]
DATA = os.path.join(os.path.dirname(__file__), "..", "data", "questions.json")

def q(qid, prompt, note=None, **by_tier):
    answers = []
    for tier in TIERS:
        for entry in by_tier.get(tier, []):
            if isinstance(entry, str):
                name, quip, aliases = entry, "", []
            elif len(entry) == 2:
                name, quip, aliases = entry[0], entry[1], []
            else:
                name, quip, aliases = entry[0], entry[1], list(entry[2])
            answers.append([name, tier, quip, aliases])
    item = {"id": qid, "prompt": prompt, "answers": answers}
    if note:
        item["note"] = note
    return item

def add(questions):
    if os.path.exists(DATA):
        with open(DATA) as f:
            doc = json.load(f)
    else:
        doc = {
            "_readme": "Authoring source for The Daily Climb. Each answer is "
                       "[name, tier, quip, aliases]. Tiers: dust 10, tooclever 15, "
                       "flocker 30, rare 60, farout 85, astronomical 100. Exactly one "
                       "astronomical per question. Run `npm run keys` after editing.",
            "questions": [],
        }
    have = {x["id"] for x in doc["questions"]}
    for item in questions:
        if item["id"] in have:
            doc["questions"] = [item if x["id"] == item["id"] else x for x in doc["questions"]]
        else:
            doc["questions"].append(item)
    with open(DATA, "w") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print(f"{len(doc['questions'])} questions, "
          f"{sum(len(x['answers']) for x in doc['questions'])} answers")
