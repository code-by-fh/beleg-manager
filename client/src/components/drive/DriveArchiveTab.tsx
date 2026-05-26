import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { driveApi } from "@/api/drive";
import { DriveArchiveTree } from "./DriveArchiveTree";
import {
  FileText,
  FileImage,
  ExternalLink,
  X,
  AlertTriangle,
  FolderOpen,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ArchiveFile } from "@/types/receipt";

function PreviewContent({ file, zoomable = false }: { file: ArchiveFile; zoomable?: boolean }) {
  const previewUrl = `/api/drive/archive/${file.id}/preview`;
  const isImage = file.mimeType.startsWith("image/");
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden bg-black/5 dark:bg-white/5 flex items-center justify-center">
        {isImage ? (
          zoomable ? (
            <TransformWrapper minScale={0.5} maxScale={8} centerOnInit>
              <TransformComponent
                wrapperStyle={{ width: "100%", height: "100%" }}
                contentStyle={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <img
                  src={previewUrl}
                  alt={file.name}
                  className="max-h-full max-w-full object-contain"
                  draggable={false}
                />
              </TransformComponent>
            </TransformWrapper>
          ) : (
            <img
              src={previewUrl}
              alt={file.name}
              className="max-h-full max-w-full object-contain"
            />
          )
        ) : (
          <iframe
            src={previewUrl}
            title={file.name}
            className="w-full h-full border-0"
          />
        )}
      </div>
      <div className="px-4 py-3 border-t border-[hsl(var(--border))] shrink-0">
        <a
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-sm text-[hsl(var(--primary))] hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          In neuem Tab öffnen
        </a>
      </div>
    </div>
  );
}

export function DriveArchiveTab() {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<ArchiveFile | null>(null);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);

  const treeQuery = useQuery({
    queryKey: ["drive", "archive", "tree"],
    queryFn: () => driveApi.archiveTree(),
    staleTime: 60_000,
  });

  const filesQuery = useQuery({
    queryKey: ["drive", "archive", "files", selectedFolderId],
    queryFn: () => driveApi.archiveFiles(selectedFolderId!),
    enabled: !!selectedFolderId,
  });

  useEffect(() => {
    if (treeQuery.data?.years.length && !selectedFolderId) {
      const years = treeQuery.data.years;
      const lastYear = years[years.length - 1];
      if (lastYear?.months?.length) {
        const months = lastYear.months;
        setSelectedFolderId(months[months.length - 1]!.id);
      }
    }
  }, [treeQuery.data, selectedFolderId]);

  useEffect(() => {
    setSelectedFile(null);
    setMobilePreviewOpen(false);
  }, [selectedFolderId]);

  function handleFileClick(file: ArchiveFile) {
    setSelectedFile(file);
    if (window.innerWidth < 768) {
      setMobilePreviewOpen(true);
    }
  }

  if (treeQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-[hsl(var(--muted-foreground))] text-sm gap-2">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Lade Archiv...
      </div>
    );
  }

  if (treeQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertTriangle className="h-8 w-8 text-[hsl(var(--destructive))]" />
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Archiv konnte nicht geladen werden.</p>
        <Button variant="outline" size="sm" onClick={() => treeQuery.refetch()}>
          Erneut versuchen
        </Button>
      </div>
    );
  }

  const years = treeQuery.data?.years ?? [];

  if (!years.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-[hsl(var(--muted-foreground))]">
        <FolderOpen className="h-12 w-12" />
        <p className="text-sm">Noch keine archivierten Belege in Google Drive.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col md:flex-row md:h-[calc(100vh-16rem)] rounded-xl border border-[hsl(var(--border))] overflow-hidden">
        {/* Tree sidebar */}
        <div className="md:w-52 md:shrink-0 border-b md:border-b-0 md:border-r border-[hsl(var(--border))] p-3 overflow-y-auto max-h-48 md:max-h-none">
          <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-3 px-2">
            Archiv
          </p>
          <DriveArchiveTree
            years={years}
            selectedFolderId={selectedFolderId}
            onSelectMonth={setSelectedFolderId}
          />
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto min-h-48">
          {filesQuery.isLoading && (
            <div className="flex items-center justify-center h-32 gap-2 text-[hsl(var(--muted-foreground))] text-sm">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Lade Dateien...
            </div>
          )}
          {filesQuery.isError && (
            <div className="flex items-center justify-center h-32 gap-2 text-[hsl(var(--destructive))] text-sm">
              <AlertTriangle className="h-4 w-4" />
              Dateien konnten nicht geladen werden.
            </div>
          )}
          {filesQuery.data?.files.length === 0 && (
            <div className="flex items-center justify-center h-32 text-[hsl(var(--muted-foreground))] text-sm">
              Keine Dateien in diesem Monat.
            </div>
          )}
          {filesQuery.data?.files.map((file) => {
            const isImage = file.mimeType.startsWith("image/");
            return (
              <button
                key={file.id}
                onClick={() => handleFileClick(file)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3 text-left border-b border-[hsl(var(--border))] transition-colors",
                  selectedFile?.id === file.id
                    ? "bg-[hsl(var(--muted))]"
                    : "hover:bg-[hsl(var(--muted)/0.5)]"
                )}
              >
                {isImage
                  ? <FileImage className="h-5 w-5 shrink-0 text-[hsl(var(--muted-foreground))]" />
                  : <FileText className="h-5 w-5 shrink-0 text-[hsl(var(--muted-foreground))]" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{file.name}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    {file.modifiedTime
                      ? new Date(file.modifiedTime).toLocaleDateString("de-DE")
                      : "—"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Desktop preview panel */}
        {selectedFile && (
          <div className="hidden md:flex w-96 shrink-0 border-l border-[hsl(var(--border))] flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--border))] shrink-0">
              <p className="text-sm font-medium truncate flex-1 mr-2">{selectedFile.name}</p>
              <button
                onClick={() => setSelectedFile(null)}
                className="shrink-0 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                aria-label="Vorschau schließen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <PreviewContent file={selectedFile} />
          </div>
        )}
      </div>

      {/* Mobile preview dialog */}
      <Dialog open={mobilePreviewOpen} onOpenChange={setMobilePreviewOpen}>
        <DialogContent className="md:hidden max-w-full h-[90dvh] flex flex-col p-0">
          <DialogHeader className="px-4 py-3 shrink-0 border-b border-[hsl(var(--border))]">
            <DialogTitle className="text-sm font-medium truncate">
              {selectedFile?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedFile && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <PreviewContent file={selectedFile} zoomable />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
