import {
  BASIC_FUNCTIONS,
  ButtonApi,
  CardApi,
  CheckBoxApi,
  ChoicePickerApi,
  ColumnApi,
  CommonSchemas,
  DividerApi,
  RowApi,
  TextApi,
  TextFieldApi,
} from "@a2ui/web_core/v1_0";

export const A2UI_VERSION = "1.0";
export const CATALOG_ID = "https://agent-control.local/a2ui/catalog/v1";

// The schemas below are built from A2UI's own schemas (`extend`, `array`), never from this project's
// zod: @a2ui/web_core ships its own zod 3 copy, and a schema from another copy fails its types.

/**
 * A choice row with a description and an optional preview shown while it is hovered.
 * Bind `selection` to a string list and give `value` to make it a toggle (`single` makes the group pick one);
 * give `action` to send at once instead.
 */
export const OptionApi = {
  name: "Option",
  schema: ButtonApi.schema.pick({ action: true }).partial().extend({
    label: CommonSchemas.DynamicString.describe("The option's title."),
    description: CommonSchemas.DynamicString.optional().describe("One line under the title."),
    preview: CommonSchemas.DynamicString.optional().describe("Monospace text shown under the card while this option is hovered or picked."),
    value: CommonSchemas.DynamicString.optional().describe("The value this option adds to `selection`."),
    selection: CommonSchemas.DynamicStringList.optional().describe("Bind to a string list in the data model; the option toggles its value there."),
    single: CommonSchemas.DynamicBoolean.optional().describe("With `selection`: picking this option replaces the list instead of adding to it."),
  }),
};

/** The basic TextField with an optional label (give `accessibility.label` instead) and an optional `action` sent on Enter. */
export const AppTextFieldApi = {
  name: "TextField",
  schema: TextFieldApi.schema.extend({
    label: CommonSchemas.DynamicString.optional().describe("Visible label above the field."),
    action: ButtonApi.schema.shape.action.optional(),
  }),
};

export const CodeApi = {
  name: "Code",
  schema: TextApi.schema.pick({ text: true }).extend({
    text: CommonSchemas.DynamicString.describe("Monospace text, such as a command or a file path."),
  }),
};

export const TableApi = {
  name: "Table",
  schema: TextApi.schema.pick({}).extend({
    columns: CommonSchemas.DynamicString.array().describe("Column headers."),
    rows: CommonSchemas.DynamicString.array().array().describe("One array of cells per row, in column order."),
  }),
};

export const COMPONENT_APIS = [
  TextApi,
  ButtonApi,
  RowApi,
  ColumnApi,
  CardApi,
  DividerApi,
  ChoicePickerApi,
  AppTextFieldApi,
  CheckBoxApi,
  OptionApi,
  CodeApi,
  TableApi,
] as const;

export const COMPONENT_NAMES = COMPONENT_APIS.map((api) => api.name);

/** The basic catalog's logic functions minus openUrl, so a card cannot open a page by itself. */
export const CATALOG_FUNCTIONS = BASIC_FUNCTIONS.filter((fn) => fn.name !== "openUrl");
