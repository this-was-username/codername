#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

/*
 * Markdown API documentation -> TypeScript declaration file
 *
 * Usage:
 *
 *   node generate-dts.mjs api.md api.d.ts
 *
 * Example:
 *
 *   node generate-dts.mjs docs.md src/api.d.ts
 */

const [, , inputFile = "official-reference-copy.md", outputFile = "src/api.d.ts"] = process.argv;

const inputPath = path.resolve(inputFile);
const outputPath = path.resolve(outputFile);

if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
}

const markdown = fs.readFileSync(inputPath, "utf8");

const functions = parseMarkdown(markdown);
const dts = generateDts(functions);

fs.mkdirSync(path.dirname(outputPath), {
    recursive: true,
});

fs.writeFileSync(outputPath, dts, "utf8");

console.log(
    `Generated ${functions.length} functions -> ${outputPath}`,
);

/* ========================================================================== */
/* Markdown parsing                                                           */
/* ========================================================================== */

function parseMarkdown(markdown) {
    const lines = markdown.split(/\r?\n/);

    const functions = [];

    let currentFunction = null;
    let inParameters = false;

    for (const line of lines) {
        /*
         * Function:
         *
         * ## applyImpulse
         */
        const heading = line.match(
            /^##\s+([A-Za-z_$][\w$]*)\s*$/,
        );

        if (heading) {
            if (currentFunction) {
                functions.push(currentFunction);
            }

            currentFunction = {
                name: heading[1],
                description: "",
                parameters: [],
                returnType: "void",
            };

            inParameters = false;

            continue;
        }

        if (!currentFunction) {
            continue;
        }

        /*
         * Parameters:
         *
         * ### Parameters:
         */
        if (/^###\s+Parameters\s*:?\s*$/i.test(line)) {
            inParameters = true;
            continue;
        }

        /*
         * Any other ### section ends parameters.
         */
        if (/^###\s+/.test(line)) {
            inParameters = false;
            continue;
        }

        /*
         * Description before Parameters.
         */
        if (!inParameters) {
            const text = line.trim();

            if (text && !currentFunction.description) {
                currentFunction.description = cleanDescription(text);
            }

            continue;
        }

        /*
         * Ignore blank lines.
         */
        if (!line.trim()) {
            continue;
        }

        /*
         * Ignore Markdown table separator:
         *
         * |-----------|------|-------------|
         */
        if (isTableSeparator(line)) {
            continue;
        }

        /*
         * Parse table rows.
         */
        if (!line.trimStart().startsWith("|")) {
            continue;
        }

        const cells = splitMarkdownTableRow(line);

        if (cells.length < 2) {
            continue;
        }

        /*
         * Header:
         *
         * | Parameter | Type | Description |
         */
        if (
            cells[0].toLowerCase() === "parameter" &&
            cells[1].toLowerCase() === "type"
        ) {
            continue;
        }

        const rawName = cleanParameterName(cells[0]);

        if (!rawName) {
            continue;
        }

        const optional = rawName.endsWith("?");

        const name = optional
            ? rawName.slice(0, -1)
            : rawName;

        const type = cleanType(cells[1]);

        const description = cleanDescription(
            cells[2] ?? "",
        );

        if (!type) {
            continue;
        }

        currentFunction.parameters.push({
            name,
            optional,
            type,
            description,
        });
    }

    if (currentFunction) {
        functions.push(currentFunction);
    }

    return functions;
}

/* ========================================================================== */
/* Markdown table parser                                                      */
/* ========================================================================== */

/**
 * Split a Markdown table row.
 *
 * IMPORTANT:
 *
 * This understands escaped pipes.
 *
 * Example:
 *
 * | killer | `{ eId: EntityId } \| { name: string }` | desc |
 *
 * becomes:
 *
 * [
 *   "killer",
 *   "`{ eId: EntityId } \\| { name: string }`",
 *   "desc"
 * ]
 *
 * Empty cells are preserved:
 *
 * | foo | `string` |  |
 *
 * becomes:
 *
 * [
 *   "foo",
 *   "`string`",
 *   ""
 * ]
 */
function splitMarkdownTableRow(line) {
    const cells = [];

    let current = "";
    let escaped = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (escaped) {
            current += char;
            escaped = false;
            continue;
        }

        if (char === "\\") {
            /*
             * Keep the slash so cleanType() can later turn
             *
             * \|
             *
             * into
             *
             * |
             */
            current += char;
            escaped = true;
            continue;
        }

        if (char === "|") {
            cells.push(current.trim());
            current = "";
            continue;
        }

        current += char;
    }

    /*
     * Always push final cell.
     */
    cells.push(current.trim());

    /*
     * Remove the syntactic leading/trailing cells caused
     * by the outer Markdown pipes.
     *
     * Do NOT filter empty cells.
     */
    if (line.trimStart().startsWith("|")) {
        cells.shift();
    }

    if (line.trimEnd().endsWith("|")) {
        cells.pop();
    }

    return cells;
}

function isTableSeparator(line) {
    const cells = splitMarkdownTableRow(line);

    if (cells.length === 0) {
        return false;
    }

    return cells.every((cell) => {
        return /^:?-+:?$/.test(cell.trim());
    });
}

/* ========================================================================== */
/* Cleaning                                                                   */
/* ========================================================================== */

function cleanParameterName(name) {
    return name
        .trim()
        .replace(/^`|`$/g, "")
        .trim();
}

function cleanType(type) {
    let result = type
        .trim()
        .replace(/^`|`$/g, "")
        /*
         * Markdown escaped pipe.
         *
         * \| -> |
         */
        .replace(/\\\|/g, "|")
        /*
         * Common Markdown escapes.
         */
        .replace(
            /\\([\\`*_{}\[\]()#+.!<>-])/g,
            "$1",
        )
        .trim();

    /*
     * Normalize object types.
     */
    result = normalizeObjectType(result);

    return result;
}

function cleanDescription(description) {
    return description
        .trim()
        .replace(/^`|`$/g, "")
        .replace(/\\\|/g, "|")
        .replace(
            /\\([\\`*_{}\[\]()#+.!<>-])/g,
            "$1",
        )
        .replace(/\s+/g, " ")
        .trim();
}

/* ========================================================================== */
/* Type normalization                                                         */
/* ========================================================================== */

function normalizeObjectType(type) {
    /*
     * Only deal with simple object types.
     *
     * Example:
     *
     * { foo: string; bar?: number }
     */
    if (
        !type.startsWith("{") ||
        !type.endsWith("}")
    ) {
        return type;
    }

    const inner = type.slice(1, -1).trim();

    if (!inner) {
        return "{}";
    }

    const properties = splitObjectProperties(inner);

    if (properties.length === 0) {
        return type;
    }

    return `{ ${properties.join(" ")} }`;
}

/**
 * Split object properties.
 *
 * Supports:
 *
 * { foo: string; bar: number }
 *
 * { foo: string, bar: number }
 *
 * and also the malformed-but-common:
 *
 * { foo: string bar: number baz?: boolean }
 *
 * The last form requires detecting the next property name.
 */
function splitObjectProperties(value) {
    /*
     * First try explicit separators.
     */
    const explicit = splitByTopLevelSeparators(value);

    if (explicit.length > 1) {
        return explicit;
    }

    /*
     * No explicit separator.
     *
     * Try to detect:
     *
     * foo: string bar?: number baz?: boolean
     */
    return splitImplicitProperties(value);
}

function splitByTopLevelSeparators(value) {
    const properties = [];

    let current = "";

    let angleDepth = 0;
    let braceDepth = 0;
    let bracketDepth = 0;
    let parenDepth = 0;

    let quote = null;
    let escaped = false;

    for (const char of value) {
        if (quote) {
            current += char;

            if (escaped) {
                escaped = false;
                continue;
            }

            if (char === "\\") {
                escaped = true;
                continue;
            }

            if (char === quote) {
                quote = null;
            }

            continue;
        }

        if (
            char === "'" ||
            char === '"' ||
            char === "`"
        ) {
            quote = char;
            current += char;
            continue;
        }

        if (char === "<") {
            angleDepth++;
        } else if (char === ">") {
            angleDepth = Math.max(0, angleDepth - 1);
        } else if (char === "{") {
            braceDepth++;
        } else if (char === "}") {
            braceDepth = Math.max(0, braceDepth - 1);
        } else if (char === "[") {
            bracketDepth++;
        } else if (char === "]") {
            bracketDepth = Math.max(0, bracketDepth - 1);
        } else if (char === "(") {
            parenDepth++;
        } else if (char === ")") {
            parenDepth = Math.max(0, parenDepth - 1);
        }

        const topLevel =
            angleDepth === 0 &&
            braceDepth === 0 &&
            bracketDepth === 0 &&
            parenDepth === 0;

        if (
            topLevel &&
            (char === ";" || char === ",")
        ) {
            if (current.trim()) {
                properties.push(current.trim());
            }

            current = "";
            continue;
        }

        current += char;
    }

    if (current.trim()) {
        properties.push(current.trim());
    }

    return properties;
}

/**
 * Detect adjacent properties without separators.
 *
 * Example:
 *
 * damage?: PNull<number> heldItemName?: PNull<string>
 *
 * -> 
 *
 * damage?: PNull<number>
 * heldItemName?: PNull<string>
 */
function splitImplicitProperties(value) {
    const properties = [];

    let start = 0;

    let angleDepth = 0;
    let braceDepth = 0;
    let bracketDepth = 0;
    let parenDepth = 0;

    let quote = null;
    let escaped = false;

    for (let i = 0; i < value.length; i++) {
        const char = value[i];

        if (quote) {
            if (escaped) {
                escaped = false;
                continue;
            }

            if (char === "\\") {
                escaped = true;
                continue;
            }

            if (char === quote) {
                quote = null;
            }

            continue;
        }

        if (
            char === "'" ||
            char === '"' ||
            char === "`"
        ) {
            quote = char;
            continue;
        }

        if (char === "<") {
            angleDepth++;
            continue;
        }

        if (char === ">") {
            angleDepth = Math.max(0, angleDepth - 1);
            continue;
        }

        if (char === "{") {
            braceDepth++;
            continue;
        }

        if (char === "}") {
            braceDepth = Math.max(0, braceDepth - 1);
            continue;
        }

        if (char === "[") {
            bracketDepth++;
            continue;
        }

        if (char === "]") {
            bracketDepth = Math.max(0, bracketDepth - 1);
            continue;
        }

        if (char === "(") {
            parenDepth++;
            continue;
        }

        if (char === ")") {
            parenDepth = Math.max(0, parenDepth - 1);
            continue;
        }

        const topLevel =
            angleDepth === 0 &&
            braceDepth === 0 &&
            bracketDepth === 0 &&
            parenDepth === 0;

        if (!topLevel || !/\s/.test(char)) {
            continue;
        }

        /*
         * Look ahead for:
         *
         * propertyName:
         *
         * or
         *
         * propertyName?:
         */
        const rest = value.slice(i);

        const nextProperty = rest.match(
            /^\s+([A-Za-z_$][\w$]*\??)\s*:/,
        );

        if (!nextProperty) {
            continue;
        }

        const before = value.slice(start, i).trim();

        if (!before) {
            continue;
        }

        /*
         * Don't split if we're still inside a generic
         * type expression.
         */
        if (
            before.endsWith("<") ||
            before.endsWith("|") ||
            before.endsWith("&") ||
            before.endsWith(":")
        ) {
            continue;
        }

        properties.push(before);

        /*
         * Start at the next property name.
         */
        start =
            i +
            nextProperty[0].indexOf(
                nextProperty[1],
            );

        /*
         * Restart scanning state.
         */
        angleDepth = 0;
        braceDepth = 0;
        bracketDepth = 0;
        parenDepth = 0;

        i = start - 1;
    }

    const last = value.slice(start).trim();

    if (last) {
        properties.push(last);
    }

    return properties.length > 0
        ? properties
        : [value.trim()];
}

/* ========================================================================== */
/* TypeScript generation                                                      */
/* ========================================================================== */

function generateDts(functions) {
    const prefix = [];

    prefix.push(
        "// This file is auto-generated by document-to-type.mjs.",
    );
    prefix.push("");

    // prefix.push("declare type EntityId = string;");
    // prefix.push("declare type PlayerId = string;");
    // prefix.push("declare type LifeformId = string;");

    const methods = [];
    for (const fn of functions) {
        generateMethod(methods, fn);
    }

    prefix.push(generateUnknownTypes(collectReferencedTypes(methods.join("\n"))));
    prefix.push("");

    prefix.push("export interface API {");
    prefix.push("");

    const suffix = [];
    suffix.push("}");
    suffix.push("");


    suffix.push("export declare const api: API;");
    suffix.push("");

    return prefix.join("\n") + methods.join("\n") + suffix.join("\n");
}

function generateMethod(output, fn) {
    if (fn.description) {
        output.push("    /**");
        output.push(
            `     * ${escapeJsDoc(fn.description)}`,
        );

        for (const parameter of fn.parameters) {
            if (parameter.description) {
                output.push(
                    `     * @param ${parameter.name} ${escapeJsDoc(parameter.description)}`,
                );
            }
        }

        output.push("     */");
    }

    output.push(
        `    ${fn.name}(`,
    );

    for (const parameter of fn.parameters) {
        output.push(
            `        ${parameter.name}${parameter.optional ? "?" : ""}: ${formatType(parameter.type)},`,
        );
    }

    output.push(
        `    ): ${fn.returnType};`,
    );

    output.push("");
}


function generateFunction(output, fn) {
    /*
     * JSDoc
     */
    if (
        fn.description ||
        fn.parameters.some(
            (parameter) => parameter.description,
        )
    ) {
        output.push("/**");

        if (fn.description) {
            output.push(
                ` * ${escapeJsDoc(fn.description)}`,
            );
        }

        for (const parameter of fn.parameters) {
            if (!parameter.description) {
                continue;
            }

            output.push(
                ` * @param ${parameter.name} ${escapeJsDoc(parameter.description)}`,
            );
        }

        output.push(" */");
    }

    /*
     * Function declaration.
     */
    output.push(
        `export declare function ${fn.name}(`,
    );

    for (const parameter of fn.parameters) {
        output.push(
            `    ${parameter.name}${parameter.optional ? "?" : ""}: ${formatType(parameter.type)},`,
        );
    }

    output.push(
        `): ${fn.returnType};`,
    );

    output.push("");
}

function formatType(type) {
    /*
     * Keep the type valid and readable.
     *
     * Object types are expanded for readability.
     */
    if (
        type.startsWith("{") &&
        type.endsWith("}")
    ) {
        return formatObjectType(type);
    }

    return type;
}

function formatObjectType(type) {
    const inner = type.slice(1, -1).trim();

    if (!inner) {
        return "{}";
    }

    const properties = splitObjectProperties(inner);

    if (properties.length === 0) {
        return type;
    }

    /*
     * For a parameter type, multiline output is difficult
     * because the caller currently writes one line.
     *
     * Keep it valid inline:
     *
     * {
     *   foo: string;
     *   bar?: number;
     * }
     *
     * is valid TypeScript, but inline is also valid:
     *
     * { foo: string; bar?: number }
     */
    return `{ ${properties.join("; ")} }`;
}

function escapeJsDoc(value) {
    return value.replace(/\*\//g, "*\\/");
}





// Generate type declration fallback

import * as ts from "typescript";
import { Project, SyntaxKind } from "ts-morph";

function generateUnknownTypes(types) {
    return types
        .map((name) => `type ${name} = any;`)
        .join("\n");
}

function collectReferencedTypes(source) {
    const project = new Project({
        useInMemoryFileSystem: true,
        skipAddingFilesFromTsConfig: true,
    });

    const sourceFile = project.createSourceFile(
        "generated.d.ts",
        source,
        {
            overwrite: true,
        },
    );

    const builtin = new Set([
        "string",
        "number",
        "boolean",
        "bigint",
        "symbol",
        "object",
        "unknown",
        "any",
        "never",
        "void",
        "undefined",
        "null",
        "true",
        "false",
        "Array",
        "ReadonlyArray",
        "Record",
        "Partial",
        "Required",
        "Pick",
        "Omit",
        "Exclude",
        "Extract",
        "NonNullable",
        "ReturnType",
        "Parameters",
        "InstanceType",
        "ThisType",
        "Promise",
    ]);

    const types = new Set();

    const nodes = sourceFile.getDescendantsOfKind(
        SyntaxKind.TypeReference,
    );

    for (const node of nodes) {
        const name = node.getTypeName().getText();

        /*
         * Foo.Bar のようなqualified nameは除外
         */
        if (name.includes(".")) {
            continue;
        }

        if (builtin.has(name)) {
            continue;
        }

        types.add(name);
    }

    return [...types];
}
