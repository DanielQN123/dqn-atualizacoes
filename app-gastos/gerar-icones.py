"""Gera os ícones do app (Android e iPhone) a partir da logo.

Uso:  python3 gerar-icones.py logo.png [cor-de-fundo]
      python3 gerar-icones.py            (gera o ícone provisório "R$")

A cor de fundo é usada atrás da logo (padrão: branco), ex.: "#2563eb".
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

PASTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
# nome do arquivo, tamanho, fração da área ocupada pela logo
ICONES = [
    ("icon-192.png", 192, 0.80),
    ("icon-512.png", 512, 0.80),
    ("icon-maskable-512.png", 512, 0.60),  # Android recorta em círculo/gota: precisa de margem
    ("apple-touch-icon.png", 180, 0.80),   # iPhone
    ("favicon-32.png", 32, 0.90),
]


def provisorio(tam):
    img = Image.new("RGBA", (tam, tam), "#2563eb")
    d = ImageDraw.Draw(img)
    try:
        fonte = ImageFont.truetype("DejaVuSans-Bold.ttf", int(tam * 0.38))
    except OSError:
        fonte = ImageFont.load_default()
    d.text((tam / 2, tam / 2), "R$", fill="white", font=fonte, anchor="mm")
    return img


def com_logo(logo, tam, fracao, fundo):
    img = Image.new("RGBA", (tam, tam), fundo)
    l = logo.copy()
    l.thumbnail((int(tam * fracao), int(tam * fracao)), Image.LANCZOS)
    img.alpha_composite(l, ((tam - l.width) // 2, (tam - l.height) // 2))
    return img


def main():
    os.makedirs(PASTA, exist_ok=True)
    logo = Image.open(sys.argv[1]).convert("RGBA") if len(sys.argv) > 1 else None
    fundo = sys.argv[2] if len(sys.argv) > 2 else "#ffffff"
    for nome, tam, fracao in ICONES:
        img = com_logo(logo, tam, fracao, fundo) if logo else provisorio(tam)
        # iPhone não aceita transparência no ícone: salva sempre com fundo sólido.
        img.convert("RGB").save(os.path.join(PASTA, nome), optimize=True)
        print("gerado", nome)


if __name__ == "__main__":
    main()
