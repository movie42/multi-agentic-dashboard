import { Catalog } from "@a2ui/web_core/v1_0";
import type { ReactComponentImplementation } from "@a2ui/react";
import { CATALOG_FUNCTIONS, CATALOG_ID } from "@/common/a2ui/catalog";
import {
  AppButton,
  AppCard,
  AppCheckBox,
  AppChoicePicker,
  AppCode,
  AppColumn,
  AppDivider,
  AppOption,
  AppRow,
  AppTable,
  AppText,
  AppTextField,
} from "./components";

/** Same component names and schemas as the daemon validates against (`src/common/a2ui/catalog.ts`), drawn with the app's own styles. */
export const appCatalog = new Catalog<ReactComponentImplementation>(
  CATALOG_ID,
  "1.0",
  [AppText, AppButton, AppRow, AppColumn, AppCard, AppDivider, AppChoicePicker, AppTextField, AppCheckBox, AppOption, AppCode, AppTable],
  [...CATALOG_FUNCTIONS],
);
