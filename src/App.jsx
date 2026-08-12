import { useState, useEffect } from "react";
import constants, {
  buildPresenceChecklist,
  METRIC_CONFIG,
} from "../constants";

import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min?url";
import { Document, Packer, Paragraph, TextRun } from "docx";
import jsPDF from "jspdf";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

function App() {
  const [aiReady, setAiReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [resumeText, setResumeText] = useState("");
  const [presenceChecklist, setPresenceChecklist] = useState([]);
  const [analysis, setAnalysis] = useState(null);

  const [targetRole, setTargetRole] = useState("");

  const [isEditing, setIsEditing] = useState(false);
  const [editResult, setEditResult] = useState(null); // { improvedResumeText, changesSummary }

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

      if (!parsed.overallScore && !parsed.improvedResumeText && !parsed.error) {
        throw new Error("Invalid AI Response");
      }

      return parsed;
    } catch (error) {
      throw new Error("Failed to parse AI response: " + error.message);
    }
  };

  const callAI = async (prompt) => {
    const response = await window.puter.ai.chat(
      [
        { role: "system", content: "You are an expert resume reviewer." },
        { role: "user", content: prompt },
      ],
      { model: "gpt-4o" }
    );

    return parseJSONResponse(
      typeof response === "string" ? response : response?.message?.content || ""
    );
  };

  const analyzeResume = async (text, role) => {
    const promptTemplate = role
      ? constants.ANALYZE_RESUME_WITH_ROLE_PROMPT
      : constants.ANALYZE_RESUME_PROMPT;

    const prompt = promptTemplate
      .replace("{{DOCUMENT_TEXT}}", text)
      .replace("{{TARGET_ROLE}}", role || "");

    const results = await callAI(prompt);

    if (results.error) {
      throw new Error(results.error);
    }

    return results;
  };

  const generateEditedResume = async () => {
    if (!resumeText || !analysis) return;

    setIsEditing(true);
    setEditResult(null);

    try {
      const improvementAreasText = (analysis.improvementAreas || [])
        .map((a) => `- ${a.area}: ${a.detail}`)
        .join("\n") || "General clarity and impact improvements.";

      const prompt = constants.EDIT_RESUME_PROMPT.replace(
        "{{TARGET_ROLE}}",
        targetRole || "the position described"
      )
        .replace("{{DOCUMENT_TEXT}}", resumeText)
        .replace("{{IMPROVEMENT_AREAS}}", improvementAreasText);

      const result = await callAI(prompt);
      setEditResult(result);
    } catch (error) {
      alert(`Error generating edit: ${error.message}`);
    } finally {
      setIsEditing(false);
    }
  };

  const downloadEditedResume = () => {
    if (!editResult?.improvedResumeText) return;

    const blob = new Blob([editResult.improvedResumeText], {
      type: "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `improved-resume-${uploadedFile?.name?.replace(/\.pdf$/i, "") || "resume"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setUploadedFile(null);
    setResumeText("");
    setPresenceChecklist([]);
    setAnalysis(null);
    setEditResult(null);
    setTargetRole("");
  };
  const getDownloadName = (ext) => {
  const base = uploadedFile?.name?.replace(/\.pdf$/i, "") || "resume";
  return `improved-resume-${base}.${ext}`;
};

const downloadAsTxt = () => {
  if (!editResult?.improvedResumeText) return;

  const blob = new Blob([editResult.improvedResumeText], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = getDownloadName("txt");
  a.click();
  URL.revokeObjectURL(url);
};

const downloadAsDocx = async () => {
  if (!editResult?.improvedResumeText) return;

  // Split into paragraphs on blank lines / line breaks, drop empty ones
  const paragraphs = editResult.improvedResumeText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(
      (line) =>
        new Paragraph({
          children: [new TextRun({ text: line, size: 22 })], // 11pt
          spacing: { after: 120 },
        })
    );

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = getDownloadName("docx");
  a.click();
  URL.revokeObjectURL(url);
};

const downloadAsPdf = () => {
  if (!editResult?.improvedResumeText) return;

  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 48;
  const marginY = 56;
  const maxWidth = pdf.internal.pageSize.getWidth() - marginX * 2;
  const pageHeight = pdf.internal.pageSize.getHeight();
  const lineHeight = 16;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);

  const lines = pdf.splitTextToSize(editResult.improvedResumeText, maxWidth);

  let y = marginY;
  lines.forEach((line) => {
    if (y > pageHeight - marginY) {
      pdf.addPage();
      y = marginY;
    }
    pdf.text(line, marginX, y);
    y += lineHeight;
  });

  pdf.save(getDownloadName("pdf"));
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
    setEditResult(null);

    try {
      const text = await extractPDFText(file);

      setResumeText(text);
      setPresenceChecklist(buildPresenceChecklist(text));

      const result = await analyzeResume(text, targetRole.trim());

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
            Upload your resume and get instant feedback from our AI-powered analysis
          </p>
        </div>

        {!uploadedFile && (
          <div className="upload-area text-center">
            <div className="upload-zone">
              <div className="text-6xl mb-4">📄</div>

              <h3 className="text-2xl text-slate-200 mb-2">Upload Your Resume</h3>

              <p className="text-slate-400 mb-4">PDF files only * Get instant Analysis</p>

              <div className="max-w-sm mx-auto mb-4 text-left">
                <label className="block text-slate-300 text-base mb-1">
                  Role you're applying for <span className="text-slate-500">(optional)</span>
                </label>
                <input
                  type="text"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  placeholder="e.g. Senior Frontend Engineer"
                  className="w-full border p-2 rounded bg-slate-900/40 text-slate-100 placeholder-slate-500"
                  disabled={!aiReady || isLoading}
                />
              </div>

              <input
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                disabled={!aiReady || isLoading}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className={`inline-block btn-primary ${!aiReady ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                Choose File
              </label>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="p-6 sm:p-8 max-w-md mx-auto ">
            <div className="text-center">
              <div className="loading-spinner"></div>
              <h3 className="text-base font-bold text-slate-200 mb-2">Analyzing Resume...</h3>
              <div></div>
            </div>
          </div>
        )}

        {analysis && uploadedFile && (
          <div className="space-y-6 p-4 sm:px-8 lg:px-16">
            <div className="file-info-card">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                  <div className="icon-container-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border-blue-500/30">
                    <span className="text-3xl">📄</span>
                  </div>

                  <div>
                    <h3 className="text-xl font-bold text-green-500 mb-1">✅ Analysis Complete</h3>
                    <p className="text-slate-400 text-base break-all">{uploadedFile.name}</p>
                    {targetRole && (
                      <p className="text-slate-500 text-base mt-1">
                        Target role: <span className="text-cyan-300">{targetRole}</span>
                      </p>
                    )}
                  </div>
                </div>

                <button onClick={reset} className="btn-secondary">
                  Analyze Another Resume
                </button>
              </div>
            </div>

            <div className="score-card">
              <div className="text-center mb-6">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <span className="text-2xl">🏆</span>
                  <h2 className="text-2xl sm:text-3xl font-bold text-white">Overall Score</h2>
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

                {targetRole && analysis.roleFit != null && (
                  <p className="text-slate-300 text-base mt-4">
                    Role fit for <span className="text-cyan-300">{targetRole}</span>:{" "}
                    <strong>{analysis.roleFit}/10</strong>
                  </p>
                )}
              </div>
            </div>

            {/* Improvement areas */}
            {analysis.improvementAreas?.length > 0 && (
              <div className="score-card text-left">
                <h3 className="text-base font-bold text-white mb-3">📈 Improvement Areas</h3>
                <ul className="space-y-3">
                  {analysis.improvementAreas.map((item, i) => (
                    <li key={i} className="text-slate-300 text-base">
                      <span className="font-semibold text-cyan-300">{item.area}</span>
                      <p className="text-slate-400">{item.detail}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Missing skills for the role */}
            {targetRole && analysis.missingSkills?.length > 0 && (
              <div className="score-card text-left">
                <h3 className="text-base font-bold text-white mb-3">🧩 Skills to Add for "{targetRole}"</h3>
                <div className="flex flex-wrap gap-2">
                  {analysis.missingSkills.map((skill, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-300 text-base"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {analysis.matchedSkills?.length > 0 && (
              <div className="score-card text-left">
                <h3 className="text-base font-bold text-white mb-3">✅ Matched Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {analysis.matchedSkills.map((skill, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 rounded-full bg-green-500/10 border border-green-500/30 text-green-300 text-base"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Edit resume section */}
            <div className="score-card text-left text-base">
              <div className="flex text-base flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
                <h3 className="text-base font-bold text-white">✏️ Edit & Improve Resume</h3>
                <button
                  onClick={generateEditedResume}
                  disabled={isEditing}
                  className={`btn-primary ${isEditing ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {isEditing ? "Generating..." : "Generate Improved Resume"}
                </button>
              </div>

              {editResult && (
                <div className="space-y-4 text-base">
                  {editResult.changesSummary?.length > 0 && (
                    <div>
                      <h4 className="text-slate-200 font-semibold mb-2">What changed:</h4>
                      <ul className="list-disc list-inside text-slate-400 text-base space-y-1">
                        {editResult.changesSummary.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <textarea
                    className="w-full h-64 p-3 rounded bg-slate-900/40 text-slate-100 text-base font-mono"
                    value={editResult.improvedResumeText}
                    onChange={(e) =>
                      setEditResult((prev) => ({ ...prev, improvedResumeText: e.target.value }))
                    }
                  />

                  <div className="flex flex-wrap gap-3">
          <button onClick={downloadAsDocx} className="btn-secondary">
              ⬇ Download as .docx
          </button>
          <button onClick={downloadAsPdf} className="btn-secondary">
              ⬇ Download as .pdf
          </button>
          <button onClick={downloadAsTxt} className="btn-secondary">
              ⬇ Download as .txt
          </button>
          </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;