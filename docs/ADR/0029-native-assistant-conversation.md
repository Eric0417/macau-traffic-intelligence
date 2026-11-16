# Native assistant conversation

Date: 2026-11-16

The native assistant holds up to six completed exchanges for the next request. The optional journey request field is history, an array of question and reply objects from oldest to newest. Questions and replies are limited to 500 and 1,200 UTF-16 units respectively. The client sends short text summaries of structured results and excludes coordinates from these summaries. New conversation clears them. The app and server do not persist the transcript. The assistant disclosure explains that recent messages go to the AI provider.

Place and intent interpretation may use recent exchanges to resolve a follow-up. The current request can correct the earlier conversation. Each provider call gets its own server-controlled system prompt. Earlier messages provide context and do not establish live facts, change the schema, or authorize a fresh location request. Named places and route options are checked against the current search. The response may answer ordinary travel-related questions and give general guidance when a specific live check is unavailable.

Requests carrying the optional history field can receive a final answer result. On NDJSON requests, free-form replies emit text events with additive text as the provider sends it. Candidate geometry, itinerary details and controls still require a completed, validated response. Canceled and incomplete output never enters conversation history. Requests without the field retain their existing response shapes.
