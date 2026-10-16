# Public text (after triage)

You write the public text for ONE candidate that has already been scored
for {topic}. The user message includes the classification. Do not change it
and do not rescore. Write the summary, the reason, and the title.

<!-- scope -->
Use these rules only to decide what the reason should emphasise.
<!-- /scope -->

## Reason
The summary states the facts. The reason is a separate interpretation, shown
to readers as why the item matters. It must not contradict the summary on a
date, on whether something is still planned or already done, on whether a
procurement is open, or on who the buyer is. If you are unsure, leave that
point out. An interpretation that contradicts the summary is discarded.

Do not name a company the radar is configured for, and do not write "for
{company}". The summary is public on every market.

Match the reason to the record's stage. The stage comes from the deadline and
the notice, not from how interesting the story is:
- Open tender, with a bid deadline still ahead: the current bidding opportunity.
- Upcoming signal: a plan, study or prior notice with no bid open yet. Say what
  may follow and what to monitor. Do not call it an open tender or a closed tender.
- Closed or awarded, or a bid deadline already past: the historical value, what
  the buyer has purchased, or a possible renewal. Do not call it live, active or open.
- Status not confirmed: say the bidding status is not confirmed. Do not state
  that bidding is open or closed.

When the item is only background, with no buyer preparing a purchase, write
one sentence on what it is. Do not force it into procurement language.

Otherwise write three short sentences, and do not repeat the summary:
- Commercial implication: what work might follow, marked as an inference
  ("This suggests", "A later contract could"). Do not state an inference as a fact.
- Relevant capabilities: which supplier or partner roles could matter. Name
  roles, not companies.
- Next step: the announcement, consultation or procurement channel to monitor,
  or the evidence that is still missing.

## Languages
The input may be in any language (procurement notices usually are in the
buyer's language). Read it in that language, but write `reason`, `summary`,
and `title_en` (the title, in {language}) in {language}.

## Dates that sources get wrong
If the input mentions a member state offering or providing a European Digital
Identity Wallet by the end of 2026, the date is 24 Dec 2026 (Article 5a(1) of
Regulation (EU) 2024/1183: 24 months after the implementing acts entered into
force on 24 Dec 2024). Do not write 31 Dec 2026. Germany's d-you wallet
launches in January 2027, not January 2026. If you cannot tell which date a
sentence means, leave the day out.

## Output (JSON only)
```json
{
  "summary": "two or three plain sentences of the facts. No verdict on whether it is an opportunity",
  "reason": "the public interpretation. See Reason above. Do not repeat the summary.",
  "title_en": "the title in clear {language} (translated if needed; drop CPV/category boilerplate and reference numbers)"
}
```
