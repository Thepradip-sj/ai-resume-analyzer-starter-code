import { useState, useEffect } from "react";
import constants, {
  buildPresenceChecklist,
  METRIC_CONFIG,
} from "../constants";

import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

function App() {
  const [aiReady, setAiReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [resumeText, setResumeText] = useState("");
  const [presenceChecklist, setPresenceChecklist] = useState([]);
  const [analysis, setAnalysis] = useState(null);

  useEffect(() => {
    const interval = setInterval(() => {
      if (window.puter?.ai?.chat) {
        setAiReady(true);
        clearInterval(interval);
      }
    }, 300);

    return () => clearInterval(interval);
  }, []);

  const extractPDFText = async (file) => {
    const arrayBuffer = await file.arrayBuffer();

    const pdf = await pdfjsLib.getDocument({
      data: arrayBuffer,
    }).promise;

    const texts = await Promise.all(
      Array.from({ length: pdf.numPages }, async (_, i) => {
        const page = await pdf.getPage(i + 1);
        const content = await page.getTextContent();

        return content.items.map((item) => item.str).join(" ");
      })
    );

    return texts.join("\n").trim();
  };

  const parseJSONResponse = (reply) => {
    try {
      const match = reply.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : {};

      if (!parsed.overallScore && !parsed.error) {
        throw new Error("Invalid AI Response");
      }

      return parsed;
    } catch (error) {
      throw new Error(
        "Failed to parse AI response: " + error.message
      );
    }
  };

  const analyzeResume = async (text) => {
    const prompt =
      constants.ANALYZE_RESUME_PROMPT.replace(
        "{{DOCUMENT_TEXT}}",
        text
      );

    const response = await window.puter.ai.chat(
      [
        {
          role: "system",
          content: "You are an expert resume reviewer.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      {
        model: "gpt-4o",
      }
    );

    const results = parseJSONResponse(
      typeof response === "string"
        ? response
        : response?.message?.content || ""
    );

    if (results.error) {
      throw new Error(results.error);
    }

    return results;
  };

  const reset = () => {
    setUploadedFile(null);
    setResumeText("");
    setPresenceChecklist([]);
    setAnalysis(null);
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];

    if (!file || file.type !== "application/pdf") {
      alert("Please upload a valid PDF file.");
      return;
    }

    setUploadedFile(file);
    setIsLoading(true);
    setAnalysis(null);
    setResumeText("");
    setPresenceChecklist([]);

    try {
      const text = await extractPDFText(file);

      setResumeText(text);
      setPresenceChecklist(
        buildPresenceChecklist(text)
      );

      const result = await analyzeResume(text);

      setAnalysis(result);
    } catch (error) {
      alert(`Error: ${error.message}`);
      reset();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-main-gradient p-4 sm:p-6 lg:p-8 flex items-center justify-center">
      <div className="max-w-5xl mx-auto w-full">
        <div className="text-center mb-8">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl bg-gradient-to-r from-cyan-300 via-teal-200 to-sky-300 bg-clip-text text-transparent mb-2">
            AI RESUME ANALYZER
          </h1>

          <p className="text-slate-300 text-sm sm:text-base">
            Upload your resume and get instant feedback from
            our AI-powered analysis
          </p>
        </div>

        {!uploadedFile && (
          <div className="upload-area text-center">
            <div className="upload-zone">
              <div className="text-6xl mb-4">📄</div>

              <h3 className="text-2xl text-slate-200 mb-2">
                Upload Your Resume
              </h3>

              <p className="text-slate-400 mb-4">
                PDF files only * Get instant Analysis
              </p>

              <input
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                className="border p-2 rounded"
                disabled={!aiReady || isLoading}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className={`inline-block btn-primary ${!aiReady? "opacity-50 cursor-not-allowed" : ""}`}
              >
                Choose File
              </label>
            </div>
          </div>
        )}
        {
          isLoading && (
            <div className="p-6 sm:p-8 max-w-md mx-auto ">
              <div className="text-center">
                <div className="loading-spinner"></div>
                <h3 className="text-xl font-bold text-slate-200 mb-2">Analyzing Resume...</h3>
                <div></div>
              </div>
            </div>
          )
        }


      {analysis && uploadedFile && (
  <div className="space-y-6 p-4 sm:px-8 lg:px-16">
    <div className="file-info-card">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="icon-container-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border-blue-500/30">
            <span className="text-3xl">📄</span>
          </div>

          <div>
            <h3 className="text-xl font-bold text-green-500 mb-1">
              ✅ Analysis Complete
            </h3>
            <p className="text-slate-400 text-sm break-all">
              {uploadedFile.name}
            </p>
          </div>
        </div>

        <button
          onClick={reset}
          className="btn-secondary"
        >
          Analyze Another Resume
        </button>
      </div>
      </div>
      <div className="score-card">
  <div className="text-center mb-6">
    <div className="flex items-center justify-center gap-2 mb-3">
      <span className="text-2xl">🏆</span>

      <h2 className="text-2xl sm:text-3xl font-bold text-white">
        Overall Score
      </h2>
    </div>

    <div className="relative">
      <p className="text-6xl sm:text-8xl font-extrabold text-cyan-400 drop-shadow-lg">
        {analysis.overallScore || "7"}
      </p>
    </div>
    <div
  className={`inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-full ${
    parseInt(analysis.overallScore) >= 8
      ? "score-status-excellent"
      : parseInt(analysis.overallScore) >= 6
      ? "score-status-good"
      : "score-status-improvement"
  }`}
>
  <span className="text-lg">
    {parseInt(analysis.overallScore) >= 8
      ? "🌟"
      : parseInt(analysis.overallScore) >= 6
      ? "⭐"
      : "📈"}
  </span>

  <span>
    {parseInt(analysis.overallScore) >= 8
      ? "Excellent"
      : parseInt(analysis.overallScore) >= 6
      ? "Good"
      : "Needs Improvement"}
  </span>
</div>
  </div>
</div>
    </div>
  
)}
      </div>
    </div>
  );
}

export default App;