import { describe, it, expect, vi } from "vitest";
import { listSubfolders } from "../src/google/drive.js";
import type { DriveClient } from "../src/google/drive.js";

describe("listSubfolders", () => {
  it("returns folder children ordered by name", async () => {
    const mockDrive = {
      files: {
        list: vi.fn().mockResolvedValue({
          data: { files: [{ id: "id-2024", name: "2024" }, { id: "id-2025", name: "2025" }] },
        }),
      },
    } as unknown as DriveClient;

    const result = await listSubfolders(mockDrive, "parent-id");

    expect(mockDrive.files.list).toHaveBeenCalledWith({
      q: "'parent-id' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'",
      fields: "files(id,name)",
      pageSize: 50,
      orderBy: "name",
    });
    expect(result).toEqual([{ id: "id-2024", name: "2024" }, { id: "id-2025", name: "2025" }]);
  });

  it("returns empty array when folder has no subfolders", async () => {
    const mockDrive = {
      files: {
        list: vi.fn().mockResolvedValue({ data: { files: [] } }),
      },
    } as unknown as DriveClient;

    const result = await listSubfolders(mockDrive, "empty-parent");
    expect(result).toEqual([]);
  });

  it("returns empty array when files field is missing", async () => {
    const mockDrive = {
      files: {
        list: vi.fn().mockResolvedValue({ data: {} }),
      },
    } as unknown as DriveClient;

    const result = await listSubfolders(mockDrive, "any-id");
    expect(result).toEqual([]);
  });
});
