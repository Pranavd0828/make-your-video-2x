import { useState, useRef, useEffect } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

function App() {
  const [loaded, setLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [processedUrl, setProcessedUrl] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Initializing...");
  const ffmpegRef = useRef(new FFmpeg());
  const messageRef = useRef(null);

  const load = async () => {
    setIsLoading(true);
    const baseURL = "";
    const ffmpeg = ffmpegRef.current;

    ffmpeg.on("log", ({ message }) => {
      if (messageRef.current) messageRef.current.innerHTML = message;
      console.log(message);
    });

    ffmpeg.on("progress", ({ progress, time }) => {
      // progress is 0-1
      setProgress(Math.round(progress * 100));
    });

    try {
      await ffmpeg.load({
        coreURL: await toBlobURL("/ffmpeg-core.js", "text/javascript"),
        wasmURL: await toBlobURL("/ffmpeg-core.wasm", "application/wasm"),
      });
      setLoaded(true);
      setStatus("Ready");
    } catch (e) {
      console.error(e);
      setStatus("Failed to load FFmpeg: " + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      setProcessedUrl(null);
      setProgress(0);
      setStatus("Ready to process");
    }
  };

  const processVideo = async () => {
    if (!videoFile) return;
    setStatus("Processing... This may take a moment.");
    const ffmpeg = ffmpegRef.current;

    try {
      await ffmpeg.writeFile("input.mov", await fetchFile(videoFile));

      // 2x speed means setpts=0.5*PTS for video, and atempo=2.0 for audio
      // We use -filter_complex to handle both streams safely even if audio is missing (though simpler filter chains are safer for basic usage)
      // Let's try simple filter first.

      // Command: ffmpeg -i input.mov -filter_complex "[0:v]setpts=0.5*PTS[v];[0:a]atempo=2.0[a]" -map "[v]" -map "[a]" output.mp4
      // Check if file has audio? For simplicity we assume it does or we use a filter that doesn't fail if audio missing? 
      // Actually, let's just use -vf setpts=0.5*PTS -af atempo=2.0. If no audio, -af might be ignored or warn.
      // Wait, if no audio stream, -af will fail.
      // FFmpeg.wasm might fail if streams don't match.
      // Let's stick to video only speed first? No, user said "video", usually implies audio too.

      await ffmpeg.exec([
        "-i", "input.mov",
        "-filter_complex", "[0:v]setpts=0.5*PTS[v];[0:a]atempo=2.0[a]",
        "-map", "[v]",
        "-map", "[a]",
        "output.mp4"
      ]);

      // If the above fails (e.g. no audio), we can try catch and run video only?
      // Or we can probe first.
      // Let's assume standard mov with audio.

      const data = await ffmpeg.readFile("output.mp4");
      const url = URL.createObjectURL(new Blob([data.buffer], { type: "video/mp4" }));
      setProcessedUrl(url);
      setStatus("Done!");
    } catch (error) {
      console.error("Processing failed", error);
      // Fallback or error message
      // Try video only speedup as fallback
      try {
        console.log("Retrying video-only speedup...");
        await ffmpeg.exec([
          "-i", "input.mov",
          "-filter:v", "setpts=0.5*PTS",
          "-an",
          "output.mp4"
        ]);
        const data = await ffmpeg.readFile("output.mp4");
        const url = URL.createObjectURL(new Blob([data.buffer], { type: "video/mp4" }));
        setProcessedUrl(url);
        setStatus("Done (Video Only)!");
      } catch (e2) {
        setStatus("Error processing video");
      }
    }
  };

  return (
    <div className="container">
      <div className="card">
        <h1>Video Speedup Tool</h1>

        {!loaded ? (
          <div className="loading">
            <div className="spinner"></div>
            <p>Loading FFmpeg Core...</p>
            <div className="status-text">{status}</div>
          </div>
        ) : (
          <div className="content">
            <div className="upload-section">
              <input
                type="file"
                onChange={handleUpload}
                accept="video/quicktime,video/mp4,video/x-m4v"
                id="file-upload"
                className="file-input"
              />
              <label htmlFor="file-upload" className="file-label">
                {videoFile ? "Change File" : "Choose Video File"}
              </label>
              {videoFile && <p className="file-name">{videoFile.name}</p>}
            </div>

            {videoUrl && !processedUrl && (
              <div className="video-preview">
                <h3>Original</h3>
                <video src={videoUrl} controls width="400" />
              </div>
            )}

            {videoFile && !processedUrl && (
              <button className="process-btn" onClick={processVideo} disabled={status.startsWith("Processing")}>
                {status.startsWith("Processing") ? `Processing...` : "Speed Up 2x"}
              </button>
            )}

            {status.startsWith("Processing") && (
              <div className="progress-container">
                <div className="progress-bar" style={{ width: `${progress}%` }}></div>
              </div>
            )}

            {processedUrl && (
              <div className="result-section">
                <h3>Result (2x Speed)</h3>
                <video src={processedUrl} controls width="400" />
                <br />
                <a href={processedUrl} download={`sped_up_${videoFile?.name || 'video'}.mp4`} className="download-btn">
                  Download Video
                </a>
                <button className="reset-btn" onClick={() => {
                  setVideoFile(null);
                  setVideoUrl(null);
                  setProcessedUrl(null);
                  setStatus("Ready");
                }}>Start Over</button>
              </div>
            )}

            <p className="status-footer">{status}</p>
            <p ref={messageRef} className="logs"></p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
