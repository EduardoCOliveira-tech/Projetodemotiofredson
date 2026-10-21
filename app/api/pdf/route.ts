import { NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';
import fs from 'fs';

// Configurações para a Vercel
export const dynamic = 'force-dynamic';
export const maxDuration = 60; 

export async function POST(req: Request) {
  try {
    const { html } = await req.json();
    
    // Resolve a URL base para que as imagens na pasta /public (JPG/PNG) carreguem no PDF
    const host = req.headers.get('host');
    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    let browser;

    if (process.env.NODE_ENV === 'development') {
      // Caminhos comuns de navegadores no Windows (incluindo o seu Brave)
      const paths = [
        "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
      ];

      const executablePath = paths.find(path => fs.existsSync(path));

      if (!executablePath) {
        throw new Error("Nenhum navegador compatível encontrado para gerar o PDF localmente.");
      }

      browser = await puppeteer.launch({
        executablePath,
        headless: true,
      });
    } else {
      // Configuração para Produção (Vercel) usando a versão Min
      browser = await puppeteer.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(
          'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar'
        ),
        headless: true,
      });
    }

    const page = await browser.newPage();
    
    // Injeta o HTML com a tag <base> para imagens e o Tailwind para estilos
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <base href="${baseUrl}/">
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            body { 
              -webkit-print-color-adjust: exact !important; 
              print-color-adjust: exact !important; 
            }
            /* Garante que o conteúdo não seja cortado */
            .print-container { width: 210mm; }
          </style>
        </head>
        <body>
          <div class="print-container">${html}</div>
        </body>
      </html>
    `, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
    });

    await browser.close();

    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="proposta-licitacao.pdf"',
      },
    });
  } catch (error: any) {
    console.error('ERRO NO SERVIDOR PDF:', error.message);
    return NextResponse.json(
      { error: 'Erro ao gerar PDF', details: error.message }, 
      { status: 500 }
    );
  }
}