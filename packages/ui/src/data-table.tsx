import type { ReactNode } from "react";
import { tokens } from "./tokens.js";

export interface DataTableColumn<T> {
  readonly key: string;
  readonly header: string;
  readonly align?: "left" | "center" | "right";
  readonly render?: (item: T) => ReactNode;
}

export interface DataTableProps<T> {
  readonly caption: string;
  readonly columns: readonly DataTableColumn<T>[];
  readonly data: readonly T[];
  readonly keyField: keyof T;
  readonly emptyMessage?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  caption,
  columns,
  data,
  keyField,
  emptyMessage = "No records found."
}: DataTableProps<T>) {
  return (
    <div
      style={{
        overflowX: "auto",
        border: `1px solid ${tokens.color.border.default}`,
        borderRadius: tokens.radius.small,
        backgroundColor: tokens.color.surface.default
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: tokens.font.family.sans,
          fontSize: tokens.font.size.body,
          textAlign: "left"
        }}
      >
        <caption
          style={{
            padding: tokens.spacing[3],
            fontSize: tokens.font.size.large,
            fontWeight: tokens.font.weight.bold,
            color: tokens.color.text.default,
            textAlign: "left",
            captionSide: "top"
          }}
        >
          {caption}
        </caption>
        <thead>
          <tr
            style={{
              backgroundColor: tokens.color.surface.subtle,
              borderBottom: `2px solid ${tokens.color.border.default}`
            }}
          >
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={{
                  padding: tokens.spacing[3],
                  fontWeight: tokens.font.weight.bold,
                  color: tokens.color.text.default,
                  textAlign: col.align ?? "left"
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  padding: tokens.spacing[6],
                  textAlign: "center",
                  color: tokens.color.text.muted,
                  fontStyle: "italic"
                }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item) => {
              const rowKey = String(item[keyField]);
              return (
                <tr
                  key={rowKey}
                  style={{
                    borderBottom: `1px solid ${tokens.color.border.default}`
                  }}
                >
                  {columns.map((col) => {
                    const cellContent = col.render
                      ? col.render(item)
                      : (item[col.key] as ReactNode);
                    return (
                      <td
                        key={col.key}
                        style={{
                          padding: tokens.spacing[3],
                          color: tokens.color.text.default,
                          textAlign: col.align ?? "left"
                        }}
                      >
                        {cellContent}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
