const fs = require('fs');
const pdfParse = require('pdf-parse');

const files = [
    { label: 'Paper 1 HL 2024', path: String.raw`C:\Users\jaeyo\OneDrive\Desktop\업무용\Economics Past Papers\2024\May 2024\Economics_paper_1__TZ1_HL.pdf` },
    { label: 'Paper 2 HLSL 2024', path: String.raw`C:\Users\jaeyo\OneDrive\Desktop\업무용\Economics Past Papers\2024\May 2024\Economics_paper_2__TZ1_HLSL.pdf` },
    { label: 'Paper 3 HL 2024', path: String.raw`C:\Users\jaeyo\OneDrive\Desktop\업무용\Economics Past Papers\2024\May 2024\Economics_paper_3__HL.pdf` },
    { label: 'MS Paper 1 HL 2024', path: String.raw`C:\Users\jaeyo\OneDrive\Desktop\업무용\Economics Past Papers\2024\May 2024\Economics_paper_1__TZ1_HL_markscheme.pdf` },
];

async function main() {
    for (const f of files) {
        const buf = fs.readFileSync(f.path);
        const data = await pdfParse(buf);
        console.log(`\n${'='.repeat(80)}`);
        console.log(`${f.label} — ${data.numpages} pages, ${data.text.length} chars`);
        console.log('='.repeat(80));
        console.log(data.text);
        console.log('\n');
    }
}

main().catch(console.error);
