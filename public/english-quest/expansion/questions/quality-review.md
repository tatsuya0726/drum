# English Quest: proposed 600-question expansion

## Contents and use

- `english-quest-600-questions.json`: authoritative UTF-8 question array.
- `validation-report.json`: mechanical validation results and SHA-256 digest of that array.
- `validate_questions.py`: standalone Python validator; no third-party packages required.
- This review: scope, checks, corrections, and integration notes.

The bank contains 100 questions at each of six levels. Every record has the same eight fields: `id`, `level`, `category`, `prompt`, `options`, `answerIndex`, `explanation`, and `englishText`. `answerIndex` is zero-based. All four options must be displayed together with both the Japanese prompt and the English stimulus. Some prompts specify an intended meaning or situation that is necessary to make the answer unique.

The categories are vocabulary/context, grammar, word order, conversation, and meaning/idioms. Early levels focus on daily words, basic sentences, and short exchanges. Later levels introduce more complex grammar, polite practical communication, inference from original short dialogues, and figurative language. Levels are editorial difficulty estimates, not certified CEFR ratings.

## Review completed

Every question was read for its intended answer, competing options, Japanese instruction, English stimulus, and explanation. A separate review pass checked each authoring batch. The combined bank received cross-batch duplicate screening and answer-position rebalancing.

Checks included:

- Four nonempty, textually distinct choices; valid answer indices
- Unique IDs, English stimuli, and prompt/stimulus pairs
- No fill-in problem that depends only on a person's name or an arbitrary number change to appear new
- Clear communicative goals for response-choice questions
- Context sufficient to disambiguate meanings and conversational intentions
- Japanese target meanings for word-order questions
- The same supplied word multiset in all word-order choices
- Alternatives involving contractions, word order, time reference, and context
- Explanations referring to the answer text rather than an option letter, so shuffling remains safe
- Exactly 25 correct answers in each option position within each level, in shuffled order
- Original examples rather than dialogue quoted from published dramas or films

## Representative corrections

- Replaced repeated vocabulary and idiom targets across authoring batches with genuinely different targets and situations.
- Replaced near-identical ticket/unless, reusable-bag, and word-order exercises.
- Replaced several higher-level grammar items that merely repeated an earlier elementary test.
- Removed alternatives that could work under a different interpretation, including an unusual passive interpretation and a paid-lending interpretation.
- Specified when an exercise requires reported-speech backshifting rather than treating every unchanged tense as universally incorrect.
- Made a discount explicit with original and reduced prices, avoiding a regional interpretation of “on sale.”
- Removed freely movable adverb alternatives in word-order exercises and fixed option word mismatches.
- Clarified formal-grammar expectations where informal usage can vary.

## Integration notes and limits

This is a proposed new bank. The existing game corpus was not provided to the question reviewers, so deduplication against that corpus remains an integration step. The validator accepts an optional older array and reports exact English-stimulus matches. It cannot establish semantic equivalence by itself.

Core grammar necessarily recurs across a six-level learning progression, but new items should add a different language decision, context, or comprehension task. Exact string uniqueness alone is not the quality standard used here.

The JSON is authoritative. Do not rebuild it from intermediate authoring scripts, which predate final editorial corrections. Preserve the reviewed correct-answer mapping when adapting the game's schema. Do not show a blank-filling question without its English stimulus, and do not omit the Japanese context from a question that relies on it.

These checks reduce errors; they do not constitute a claim of perfect linguistic coverage. User feedback should be recorded by stable question ID so that a disputed item can be reviewed and corrected without replacing unrelated content.
