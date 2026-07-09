from pydantic import BaseModel, Field


class CreateAttachmentRequest(BaseModel):
    owner_type: str
    owner_id: str
    category: str
    file_id: str
    replace_group_key: str | None = Field(default=None, max_length=120)


class ReplaceAttachmentRequest(BaseModel):
    file_id: str
    confirm_replace: bool = False
