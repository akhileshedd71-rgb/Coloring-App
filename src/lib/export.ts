import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
export async function exportPicture(dataUrl: string, title: string) {
  const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}.png`;
  if (Capacitor.isNativePlatform()) {
    const file = await Filesystem.writeFile({
      path: filename,
      data: dataUrl.split(",")[1],
      directory: Directory.Cache,
    });
    await Share.share({
      title: "Made with Little Color Club",
      files: [file.uri],
      dialogTitle: "Share your masterpiece",
    });
  } else {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.click();
  }
}
