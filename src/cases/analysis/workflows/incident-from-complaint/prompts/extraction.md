# Incident From Complaint Extraction

Extract the incident described by this civil complaint text.

Return only structured output matching the TypeScript extraction contract for this workflow.
Use neutral domain keys such as `incident`, `actors`, `source_materials`, and
`uncertainties`; do not include analysis review words in the AI response shape.

Every factual item must include source locations with complaint paragraph, page,
or section labels when available. Use `unknown` when the complaint does not
support an answer.

Do not extract claims, defenses, legal standards, litigation strategy, motion
arguments, or authorities.
