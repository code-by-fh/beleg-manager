import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PhotoUpload } from "@/components/upload/PhotoUpload";
import { CameraCapture } from "@/components/upload/CameraCapture";
import { VoiceInput } from "@/components/upload/VoiceInput";
import { DriveInbox } from "@/components/upload/DriveInbox";

export function UploadPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Beleg erfassen</h1>
      <Tabs defaultValue="photo">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="photo">Foto</TabsTrigger>
          <TabsTrigger value="camera">Kamera</TabsTrigger>
          <TabsTrigger value="voice">Sprache</TabsTrigger>
          <TabsTrigger value="drive">Drive-Inbox</TabsTrigger>
        </TabsList>
        <TabsContent value="photo"><PhotoUpload /></TabsContent>
        <TabsContent value="camera"><CameraCapture /></TabsContent>
        <TabsContent value="voice"><VoiceInput /></TabsContent>
        <TabsContent value="drive"><DriveInbox /></TabsContent>
      </Tabs>
    </div>
  );
}
