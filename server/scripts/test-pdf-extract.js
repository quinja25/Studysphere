const fs = require('fs');
const path = require('path');

// Use the same import as documentProcessor.js
const { processDocument } = require('../services/documentProcessor');

const PDF_PATH = String.raw`C:\Users\jaeyo\OneDrive\Desktop\업무용\Economics Past Papers\2024\May 2024\Economics_paper_1__TZ1_HL.pdf`;
const MS_PATH = String.raw`C:\Users\jaeyo\OneDrive\Desktop\업무용\Economics Past Papers\2024\May 2024\Economics_paper_1__TZ1_HL_markscheme.pdf`;

async function main() {
    // Test question paper
    console.log('=== QUESTION PAPER ===');
    const buf = fs.readFileSync(PDF_PATH);
    const { chunks, pages } = await processDocument(buf, {
        title: 'IB Economics Paper 1 TZ1 HL — May 2024',
        subject: 'Economics',
        docType: 'past_paper',
    });
    console.log(`Pages: ${pages}, Chunks: ${chunks.length}`);
    console.log('\n--- First 3 chunks ---');
    chunks.slice(0, 3).forEach((c, i) => {
        console.log(`\n[Chunk ${i}]`);
        console.log(c);
        console.log('---');
    });

    // Test mark scheme
    console.log('\n\n=== MARK SCHEME ===');
    const msBuf = fs.readFileSync(MS_PATH);
    const ms = await processDocument(msBuf, {
        title: 'IB Economics Paper 1 TZ1 HL — May 2024 — Mark Scheme',
        subject: 'Economics',
        docType: 'past_paper',
    });
    console.log(`Pages: ${ms.pages}, Chunks: ${ms.chunks.length}`);
    console.log('\n--- First 3 chunks ---');
    ms.chunks.slice(0, 3).forEach((c, i) => {
        console.log(`\n[Chunk ${i}]`);
        console.log(c);
        console.log('---');
    });
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
