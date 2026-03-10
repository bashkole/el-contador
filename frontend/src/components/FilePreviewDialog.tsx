import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download } from 'lucide-react';
import { api } from '@/lib/api';

type PreviewType = 'expense' | 'sale';

interface FilePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: PreviewType;
  id: string | null;
  title?: string;
}

export function FilePreviewDialog({ open, onOpenChange, type, id, title }: FilePreviewDialogProps) {
  const [info, setInfo] = useState<{ fileName: string; mimeType: string; url: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const basePath = type === 'expense' ? '/expenses' : '/sales';

  useEffect(() => {
    if (!open || !id) {
      setInfo(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    api.get(`${basePath}/${id}/file-info`)
      .then(({ data }) => {
        setInfo(data);
      })
      .catch(() => {
        setError('File not found or not available.');
        setInfo(null);
      })
      .finally(() => setLoading(false));
  }, [open, id, basePath]);

  const downloadUrl = id ? `/api${basePath}/${id}/file` : '#';
  const previewUrl = id ? `/api${basePath}/${id}/file?preview=1` : '';

  const isPdf = info?.mimeType === 'application/pdf';
  const isImage = info?.mimeType?.startsWith('image/');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[90vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title ?? (type === 'expense' ? 'Receipt / Invoice' : 'Invoice')} Preview</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 flex flex-col gap-4">
          {loading && <div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>}
          {error && <div className="text-sm text-destructive py-4">{error}</div>}
          {info && !error && (
            <>
              <div className="flex-1 min-h-[60vh] border rounded-lg bg-muted/30 overflow-hidden flex items-center justify-center">
                {isPdf && (
                  <iframe
                    title={info.fileName}
                    src={previewUrl}
                    className="w-full h-full min-h-[60vh] border-0"
                  />
                )}
                {isImage && (
                  <img
                    src={previewUrl}
                    alt={info.fileName}
                    className="max-w-full max-h-[70vh] object-contain"
                  />
                )}
                {!isPdf && !isImage && (
                  <div className="text-sm text-muted-foreground py-8">
                    Preview not available for this file type. Use Download to open it.
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between border-t pt-4">
                <span className="text-sm text-muted-foreground truncate max-w-[60%]">{info.fileName}</span>
                <a href={downloadUrl} download target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3">
                  <Download className="mr-2 h-4 w-4" /> Download
                </a>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
