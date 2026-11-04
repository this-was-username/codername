export const codeBlock = (code: string) => {
    const CHUNK_SIZE = 1500;
    const chunks = [];
    for (
        let i = 0;
        i < code.length;
        i += CHUNK_SIZE
    ) {
        chunks.push(
            code.slice(
                i,
                i + CHUNK_SIZE
            )
        );
    }
    return `(()=>{api.setLobbyDbValue("wc",${chunks.length});let c=${JSON.stringify(chunks)};c.forEach((c,i)=>api.setLobbyDbValue(\`wc\${i}\`,c));!thisPos&&(0,eval)(c.join(""))})()`;
}