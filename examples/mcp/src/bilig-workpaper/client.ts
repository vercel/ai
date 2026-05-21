import { createMCPClient } from "@ai-sdk/mcp";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import "dotenv/config";
import { z } from "zod";

const toolExecutionOptions = {
  messages: [],
  context: {},
};

interface ToolResult<T> {
  structuredContent?: T;
}

interface SheetList {
  sheets: Array<{
    name: string;
    dimensions: {
      width: number;
      height: number;
    };
  }>;
}

interface RangeReadback {
  values: unknown[][];
}

interface CellEditReadback {
  editedCell: string;
  before: {
    serialized: unknown;
  };
  after: {
    serialized: unknown;
  };
  checks: {
    persisted: boolean;
    restoredMatchesAfter: boolean;
  };
}

interface DisplayReadback {
  displayValue: string;
}

interface FormulaValidation {
  formula: string;
  valid: boolean;
}

async function main() {
  let mcpClient;

  try {
    const transport = new StdioClientTransport({
      command: "npm",
      args: [
        "exec",
        "--yes",
        "--package",
        "@bilig/workpaper",
        "--",
        "bilig-workpaper-mcp",
        "--workpaper",
        "./bilig-ai-sdk-demo.workpaper.json",
        "--init-demo-workpaper",
        "--writable",
      ],
    });

    mcpClient = await createMCPClient({ transport });

    const tools = await mcpClient.tools({
      schemas: {
        list_sheets: {
          inputSchema: z.object({}),
        },
        read_range: {
          inputSchema: z.object({
            range: z.string(),
            sheetName: z.string().optional(),
          }),
        },
        set_cell_contents: {
          inputSchema: z.object({
            sheetName: z.string(),
            address: z.string(),
            value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
          }),
        },
        get_cell_display_value: {
          inputSchema: z.object({
            sheetName: z.string(),
            address: z.string(),
          }),
        },
        validate_formula: {
          inputSchema: z.object({
            formula: z.string(),
          }),
        },
      },
    });

    const sheets = await tools.list_sheets.execute(
      {},
      {
        ...toolExecutionOptions,
        toolCallId: "list-sheets",
      }
    );

    const before = await tools.read_range.execute(
      { range: "Summary!A1:B5" },
      {
        ...toolExecutionOptions,
        toolCallId: "read-before",
      }
    );

    const edit = await tools.set_cell_contents.execute(
      {
        sheetName: "Inputs",
        address: "B3",
        value: 0.4,
      },
      {
        ...toolExecutionOptions,
        toolCallId: "set-win-rate",
      }
    );

    const after = await tools.read_range.execute(
      { range: "Summary!A1:B5" },
      {
        ...toolExecutionOptions,
        toolCallId: "read-after",
      }
    );

    const displayValue = await tools.get_cell_display_value.execute(
      {
        sheetName: "Summary",
        address: "B3",
      },
      {
        ...toolExecutionOptions,
        toolCallId: "display-expected-arr",
      }
    );

    const formulaCheck = await tools.validate_formula.execute(
      {
        formula: "=Inputs!B2*Inputs!B3",
      },
      {
        ...toolExecutionOptions,
        toolCallId: "validate-formula",
      }
    );

    const sheetList = requireStructured<SheetList>(sheets, "list_sheets");
    const summaryBefore = requireStructured<RangeReadback>(
      before,
      "read_range before edit"
    );
    const summaryAfter = requireStructured<RangeReadback>(
      after,
      "read_range after edit"
    );
    const editReadback = requireStructured<CellEditReadback>(
      edit,
      "set_cell_contents"
    );
    const expectedArrDisplay = requireStructured<DisplayReadback>(
      displayValue,
      "get_cell_display_value"
    );
    const validatedFormula = requireStructured<FormulaValidation>(
      formulaCheck,
      "validate_formula"
    );

    console.log(
      JSON.stringify(
        {
          sheets: sheetList.sheets,
          before: summaryRows(summaryBefore),
          edit: {
            cell: editReadback.editedCell,
            previousInput: editReadback.before.serialized,
            newInput: editReadback.after.serialized,
            persisted: editReadback.checks.persisted,
            restoredMatchesAfter: editReadback.checks.restoredMatchesAfter,
          },
          after: summaryRows(summaryAfter),
          expectedArrDisplay: expectedArrDisplay.displayValue,
          formulaCheck: validatedFormula,
        },
        null,
        2
      )
    );
  } finally {
    await mcpClient?.close();
  }
}

function requireStructured<T>(result: unknown, label: string): T {
  const maybeResult = result as ToolResult<T>;
  if (maybeResult.structuredContent === undefined) {
    throw new Error(`${label} did not return structured content`);
  }
  return maybeResult.structuredContent;
}

function summaryRows(readback: RangeReadback) {
  return readback.values.slice(1).map((row) => ({
    metric: cellValue(row[0]),
    value: cellValue(row[1]),
  }));
}

function cellValue(cell: unknown): unknown {
  if (typeof cell === "object" && cell !== null && "value" in cell) {
    return (cell as { value: unknown }).value;
  }
  return cell;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
