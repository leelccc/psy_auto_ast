from dataclasses import dataclass


@dataclass
class FakeObjectStat:
    size: int


class FakeStorage:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.last_upload_key: str | None = None
        self.deleted_keys: list[str] = []

    def health_check(self) -> None:
        return None

    def create_upload_url(self, storage_key: str, mime_type: str) -> tuple[str, dict[str, str]]:
        self.last_upload_key = storage_key
        return f"https://storage.test/upload/{storage_key}", {"Content-Type": mime_type}

    def stat_object(self, storage_key: str) -> FakeObjectStat:
        return FakeObjectStat(size=len(self.objects[storage_key]))

    def create_download_url(self, storage_key: str) -> str:
        return f"https://storage.test/download/{storage_key}"

    def delete_object(self, storage_key: str) -> None:
        self.objects.pop(storage_key, None)
        self.deleted_keys.append(storage_key)

    def read_object(self, storage_key: str) -> bytes:
        return self.objects[storage_key]

    def write_object(self, storage_key: str, data: bytes, mime_type: str) -> None:
        self.objects[storage_key] = data
