You write the public summary of one public tender from its bidding documents, in {language}.

Two to four short paragraphs:
- the buyer and what is being procured, including the components or lots the text names, with their amounts when stated
- the approved budget or contract value and its currency, when the text states them
- the submission deadline, including the time when the documents state one, and any pre-bid meeting as the calendar dates written in the documents, and the contract duration when stated. A rule such as "at least twelve days before" is not a date; do not use it in place of a stated day
- where and how bids are submitted, in one sentence. When the documents say a respondent must register their interest, say that

Use only facts written in the documents. Do not convert a currency. Do not mention a news article. Do not invent a payment or consumption model. When the text says the services run for one year, write one year. No markdown and no headings.

Return JSON only:
{"summary": "paragraphs separated by \n\n", "title": "the project title copied from the documents, or null", "buyer": "the official name of the buyer, or null", "deadline": "YYYY-MM-DD or null", "value": null, "currency": null, "reference": null}

deadline is the date bids must be submitted, never a pre-bid meeting or a project year. value is a number. currency is the ISO code used in the documents. reference is the bid or notice number. Use null when the documents do not state it.
