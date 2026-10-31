#!/usr/bin/env node

import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/*
 * Markdown API documentation -> TypeScript declaration file
 *
 * Usage:
 *
 *   node generate-dts.mjs api.md api.d.ts
 *
 * Default:
 *
 *   node generate-dts.mjs
 *
 *   input  = official-reference-copy.md
 *   output = src/api.d.ts
 */

const [
    ,
    ,
    inputFile = path.join(__dirname, "..", "official-reference-copy", "api-reference.md"),
    outputFile = path.join(__dirname, "..", "lib", "api.d.ts"),
] = process.argv;

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
    let inReturnType = false;

    for (const line of lines) {
        /*
         * Function heading:
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

            /*
            * ### Returns:
            */
            if (/^###\s+Returns\s*:?\s*$/i.test(line)) {
                inReturnType = true;
            }
            continue;
        }

        if (inReturnType) {
            // Next line of the heading of the returns
            currentFunction.returnType = line.replaceAll("\\", "").replaceAll("`", "");
            inReturnType = false;
        }

        /*
         * Function description.
         */
        if (!inParameters) {
            const text = line.trim();

            if (text && !currentFunction.description) {
                currentFunction.description =
                    cleanDescription(text);
            }

            continue;
        }

        /*
         * Empty line.
         */
        if (!line.trim()) {
            continue;
        }

        /*
         * Markdown table separator.
         */
        if (isTableSeparator(line)) {
            continue;
        }

        /*
         * Only process table rows.
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

        const rawName = cleanParameterName(
            cells[0],
        );

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

        /*
         * If the type column is empty, skip it.
         */
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
 * Split a Markdown table row while preserving escaped pipes.
 *
 * Example:
 *
 * | killer | `{ eId: EntityId } \| { name: string }` | desc |
 *
 * becomes:
 *
 * [
 *     "killer",
 *     "`{ eId: EntityId } \\| { name: string }`",
 *     "desc",
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

    cells.push(current.trim());

    /*
     * Remove Markdown's outer pipes.
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
        /*
         * Remove surrounding Markdown code ticks.
         */
        .replace(/^`|`$/g, "")
        /*
         * Markdown escaped pipe.
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

    const properties =
        splitObjectProperties(inner);

    if (properties.length === 0) {
        return type;
    }

    return `{ ${properties.join("; ")} }`;
}

function splitObjectProperties(value) {
    const explicit =
        splitByTopLevelSeparators(value);

    if (explicit.length > 1) {
        return explicit;
    }

    return splitImplicitProperties(value);
}

/**
 * Split:
 *
 * foo: string; bar: number
 *
 * foo: string, bar: number
 */
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
            angleDepth = Math.max(
                0,
                angleDepth - 1,
            );
        } else if (char === "{") {
            braceDepth++;
        } else if (char === "}") {
            braceDepth = Math.max(
                0,
                braceDepth - 1,
            );
        } else if (char === "[") {
            bracketDepth++;
        } else if (char === "]") {
            bracketDepth = Math.max(
                0,
                bracketDepth - 1,
            );
        } else if (char === "(") {
            parenDepth++;
        } else if (char === ")") {
            parenDepth = Math.max(
                0,
                parenDepth - 1,
            );
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
                properties.push(
                    current.trim(),
                );
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
 * Handle malformed object types such as:
 *
 * {
 *     damage?: PNull<number>
 *     heldItemName?: PNull<string>
 *     horizontalKbMultiplier?: number
 * }
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
            angleDepth = Math.max(
                0,
                angleDepth - 1,
            );
            continue;
        }

        if (char === "{") {
            braceDepth++;
            continue;
        }

        if (char === "}") {
            braceDepth = Math.max(
                0,
                braceDepth - 1,
            );
            continue;
        }

        if (char === "[") {
            bracketDepth++;
            continue;
        }

        if (char === "]") {
            bracketDepth = Math.max(
                0,
                bracketDepth - 1,
            );
            continue;
        }

        if (char === "(") {
            parenDepth++;
            continue;
        }

        if (char === ")") {
            parenDepth = Math.max(
                0,
                parenDepth - 1,
            );
            continue;
        }

        const topLevel =
            angleDepth === 0 &&
            braceDepth === 0 &&
            bracketDepth === 0 &&
            parenDepth === 0;

        if (
            !topLevel ||
            !/\s/.test(char)
        ) {
            continue;
        }

        /*
         * Detect the next property:
         *
         * foo: string bar?: number
         *
         *                   ^^^^^
         */
        const rest = value.slice(i);

        const nextProperty = rest.match(
            /^\s+([A-Za-z_$][\w$]*\??)\s*:/,
        );

        if (!nextProperty) {
            continue;
        }

        const before = value
            .slice(start, i)
            .trim();

        if (!before) {
            continue;
        }

        /*
         * Don't split in the middle of a type expression.
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

        start =
            i +
            nextProperty[0].indexOf(
                nextProperty[1],
            );

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
    const output = [];

    output.push(
        "// This file is auto-generated by document-to-type.mjs.",
    );
    output.push("");

    /*
     * Generate methods first so we can collect all referenced types.
     */
    const methods = [
        // Somehow api.log isn't written in the document
        "    /**",
        "     * Log the data",
        "     * @param data The data to log",
        "     */",
        "    log(",
        "        ...data: any[],",
        "    ): void;",
    ];

    for (const fn of functions) {
        generateMethod(methods, fn);
    }

    /*
     * Find all unknown types.
     */
    const types =
        collectReferencedTypesFromFunctions(
            functions,
        );

    const unknownTypes =
        generateUnknownTypes(types);

    if (unknownTypes) {
        output.push(unknownTypes);
        output.push("");
    }

    /*
     * API interface.
     */
    output.push("export interface API {");
    output.push("");

    output.push(...methods);

    output.push("}");
    output.push("");

    /*
     * Actual API object.
     */
    output.push(
        "export declare const api: API;",
    );

    output.push("");

    return output.join("\n");
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
                    `     * @param ${getParameterName(parameter)} ${escapeJsDoc(parameter.description)}`,
                );
            }
        }

        output.push("     */");
    }

    output.push(`    ${fn.name}(`);

    for (const parameter of fn.parameters) {
        // console.log(parameter)
        output.push(
            `        ${getParameterName(parameter)}?: ${formatType(parameter.type)},`,
        );
    }

    output.push(`    ): ${fn.returnType};`);
    output.push("");
}


function getParameterName(parameter) {
    const name = parameter.name.trim();

    // { ... } の destructuring parameter
    if (name.startsWith("{") && name.endsWith("}")) {
        return "opts";
    }

    return name;
}


/* ========================================================================== */
/* Type fallback generation                                                   */
/* ========================================================================== */

function generateUnknownTypes(types) {
    return types
        .map(
            (type) => {
                let suggestedType;
                if (type.includes("Id")) {
                    suggestedType = "string";
                } else if (type.includes("Type")) {
                    suggestedType = "string";
                } else {
                    suggestedType = "any";
                }
                return `type ${type}<T = any> = ${suggestedType};`
            }
        )
        .join("\n");
}

function collectReferencedTypesFromFunctions(
    functions,
) {
    const builtin = new Set([
        /*
         * Primitive types
         */
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

        /*
         * Built-in generic types
         */
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
        "ConstructorParameters",
        "InstanceType",
        "ThisType",
        "Promise",
        "Awaited",

        /*
         * Intrinsic string manipulation types.
         */
        "Uppercase",
        "Lowercase",
        "Capitalize",
        "Uncapitalize",
    ]);

    // const genericParameters =
    //     new Set([
    //         "T",
    //         "U",
    //         "K",
    //         "V",
    //         "P",
    //         "R",
    //         "E",
    //         "A",
    //         "B",
    //         "C",
    //     ]);
    const genericParameters = new Set([]);

    const types = new Set();

    for (const fn of functions) {
        for (const parameter of fn.parameters) {
            collectTypesFromType(
                parameter.type,
                types,
                builtin,
                genericParameters,
            );
        }

        collectTypesFromType(
            fn.returnType,
            types,
            builtin,
            genericParameters,
        );
    }

    return [...types];
}

function collectTypesFromType(
    type,
    types,
    builtin,
    genericParameters,
) {
    /*
     * Find identifiers.
     */
    const identifiers =
        type.match(
            /\b[A-Za-z_$][A-Za-z0-9_$]*\b/g,
        ) ?? [];

    for (const name of identifiers) {
        /*
         * Built-in type.
         */
        if (builtin.has(name)) {
            continue;
        }

        /*
         * Generic placeholder.
         *
         * QTEClientParameters<T>
         *
         * Don't generate:
         *
         * type T = any;
         */
        if (
            genericParameters.has(name)
        ) {
            continue;
        }

        /*
         * Check whether this identifier is
         * an object property.
         *
         * { eId: EntityId }
         *
         * `eId` is NOT a type.
         */
        const propertyPattern =
            new RegExp(
                `\\b${escapeRegExp(
                    name,
                )}\\s*\\??\\s*:`,
            );

        if (
            propertyPattern.test(type)
        ) {
            continue;
        }

        /*
         * A type can appear after:
         *
         * :
         * |
         * &
         * <
         * ,
         * (
         *
         * Examples:
         *
         * : EntityId
         * | EntityId
         * <EntityId>
         * Foo<EntityId>
         */
        const typePattern =
            new RegExp(
                `(?:^|[:|&<>,(])\\s*${escapeRegExp(
                    name,
                )}\\b`,
            );

        /*
         * Generic type itself:
         *
         * PNull<number>
         *
         *       ^
         *
         * QTEClientParameters<T>
         * ^^^^^^^^^^^^^^^^^^^
         */
        const genericPattern =
            new RegExp(
                `\\b${escapeRegExp(
                    name,
                )}\\s*<`,
            );

        if (
            typePattern.test(type) ||
            genericPattern.test(type)
        ) {
            types.add(name);
        }
    }
}

/* ========================================================================== */
/* Formatting                                                                 */
/* ========================================================================== */

function formatType(type) {
    if (
        type.startsWith("{") &&
        type.endsWith("}")
    ) {
        return formatObjectType(type);
    }

    return type;
}

function formatObjectType(type) {
    const inner = type
        .slice(1, -1)
        .trim();

    if (!inner) {
        return "{}";
    }

    const properties =
        splitObjectProperties(inner);

    if (properties.length === 0) {
        return type;
    }

    return `{ ${properties.join("; ")} }`;
}

/* ========================================================================== */
/* Utilities                                                                  */
/* ========================================================================== */

function escapeRegExp(value) {
    return value.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
    );
}

function escapeJsDoc(value) {
    return value.replace(
        /\*\//g,
        "*\\/",
    );
}
