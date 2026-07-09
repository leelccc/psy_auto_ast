from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class RecordingAIResult:
    speakers: dict[str, str]
    segments: list[dict[str, object]]
    summary: str
    chapters: list[dict[str, object]]


@dataclass(frozen=True)
class RecordingSummaryResult:
    summary: str
    chapters: list[dict[str, object]]


class RecordingAIProvider(Protocol):
    def process_recording(
        self,
        *,
        title: str,
        duration_seconds: int,
        audio_bytes: bytes | None = None,
        audio_url: str | None = None,
        mime_type: str = "audio/mp4",
    ) -> RecordingAIResult: ...

    def summarize_transcript(
        self,
        *,
        title: str,
        duration_seconds: int,
        transcript: str,
    ) -> RecordingSummaryResult: ...
