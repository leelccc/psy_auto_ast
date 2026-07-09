from io import BytesIO

from docx import Document
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas


def content_lines(title: str, content: dict) -> list[str]:
    lines = [title]
    for block in content.get("blocks", []):
        lines.append(str(block.get("title", "")))
        lines.extend(str(block.get("content", "")).splitlines() or [""])
    return [line for line in lines if line]


def render_pdf(title: str, content: dict) -> bytes:
    output = BytesIO()
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    pdf = canvas.Canvas(output, pagesize=A4)
    width, height = A4
    text = pdf.beginText(48, height - 56)
    text.setFont("STSong-Light", 12)
    text.setLeading(20)
    for line in content_lines(title, content):
        if text.getY() < 56:
            pdf.drawText(text)
            pdf.showPage()
            text = pdf.beginText(48, height - 56)
            text.setFont("STSong-Light", 12)
            text.setLeading(20)
        text.textLine(line[:80])
    pdf.drawText(text)
    pdf.save()
    return output.getvalue()


def render_docx(title: str, content: dict) -> bytes:
    document = Document()
    document.add_heading(title, level=0)
    for block in content.get("blocks", []):
        document.add_heading(str(block.get("title", "")), level=1)
        document.add_paragraph(str(block.get("content", "")))
    output = BytesIO()
    document.save(output)
    return output.getvalue()
