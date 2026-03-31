import React, { useRef, useMemo, useState, useEffect } from "react";
import {
  PdfViewerComponent,
  Toolbar,
  Magnification,
  Navigation,
  LinkAnnotation,
  BookmarkView,
  ThumbnailView,
  Print,
  TextSelection,
  TextSearch,
  Annotation,
  FormFields,
  FormDesigner,
  PageOrganizer,
  Inject
} from "@syncfusion/ej2-react-pdfviewer";
import "./index.css";

export default function PdfNewPatientForm({ user, onBack, onRegister, pdfFileName }) {
  const viewerRef = useRef(null);

  const [viewerReady, setViewerReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const API_BASE = useMemo(
    () =>
      process.env.REACT_APP_API_URL?.trim() ||
      "http://localhost:5063",
    []
  );

const effectivePdfName = useMemo(() => {
  if (pdfFileName && pdfFileName.trim()) return pdfFileName.trim();
  return "New_Patient_Form";
}, [pdfFileName]);


  /** ✅ Generate 2‑digit Patient ID */
  const generatePatientId = () => {
    const key = "patient_id_counter";
    let current = Number(localStorage.getItem(key) || "0") + 1;
    if (current > 99) current = 1;
    localStorage.setItem(key, current);
    return current.toString().padStart(2, "0");
  };

  const waitFor = (cond, timeoutMs = 3000) =>
    new Promise((resolve) => {
      const start = Date.now();
      const t = setInterval(() => {
        if (cond() || Date.now() - start > timeoutMs) {
          clearInterval(t);
          resolve(true);
        }
      }, 50);
    });

const pdfLoadedRef = useRef(false);
const handleResourcesLoaded = async () => {
  const viewer =
    viewerRef.current?.ej2Instances || viewerRef.current;
  if (!viewer) return;

  // ✅ Prevent infinite reload
  if (!pdfLoadedRef.current) {
    pdfLoadedRef.current = true;

    try {
      const filename = effectivePdfName.toLowerCase().endsWith(".pdf")
        ? effectivePdfName
        : `${effectivePdfName}.pdf`;

      const resp = await fetch(
        `${API_BASE}/api/Authentication/GetPdfStream/${encodeURIComponent(filename)}`
      );
      if (!resp.ok) return;

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);

      viewer.load(url, null); // ✅ async load
    } catch (e) {
      console.error("PDF load error:", e);
      return;
    }
  }

  // ✅ Apply Admin readonly logic AFTER load
  // applyAdminReadonlyRules();
};
// const applyAdminReadonlyRules = () => {
//   if (String(user?.role).toLowerCase() !== "admin") return;

//   const viewer =
//     viewerRef.current?.ej2Instances || viewerRef.current;
//   if (!viewer) return;

//   const editableFieldNames = [
//     "name",
//     "lastname",
//     "gender",
//     "age",
//     "phone",
//     "anumber",
//     "alternativenumber",
//     "address",
//     "date",
//     "temperature",
//     "pulse",
//     "height",
//     "weight",
//     "bmi",
//     "systolic",
//     "diastolic",
//     "physician",
//     "time",
//     "pvyes",
//     "pvno"
//   ];

//   let attempts = 0;
//   const maxAttempts = 10;

//   const tryApply = () => {
//     let fields = viewer.retrieveFormFields?.();

//     if (!fields || Object.keys(fields).length === 0) {
//       if (attempts < maxAttempts) {
//         attempts++;
//         setTimeout(tryApply, 200);
//       }
//       return;
//     }

//     if (!Array.isArray(fields)) {
//       fields = Object.values(fields);
//     }

//     fields.forEach((field) => {
//       if (!field?.name) return;

//       const fieldName = field.name.toLowerCase();
//       const isEditable = editableFieldNames.some((allowed) =>
//         fieldName.includes(allowed)
//       );

//       viewer.formDesignerModule?.updateFormField(field, {
//         isReadOnly: !isEditable
//       });
//     });
//   };

//   tryApply();
// };


/** ✅ FIXED Submit Logic */
const handlePdfSubmit = async () => {
  if (isSubmitting) return;
  setIsSubmitting(true);

  try {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // ✅ Read PDF as Blob → Base64
    const blob = await viewer.saveAsBlob();
    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onloadend = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });

    // ✅ Extract patient data from fields
    const fields = viewer.retrieveFormFields?.() || [];

    let details = {
      name: "",
      patientId: generatePatientId(),
      dob: "",
      status: "Registered",
      lastUpdated: new Date().toLocaleString(),
    };

    fields.forEach(f => {
      const nameLc = String(f.name || "").toLowerCase();
      const value = String(f.value || "").trim();

      if (
        nameLc === "name" ||
        nameLc.includes("patient name") ||
        nameLc.includes("patientname")
      ) details.name = value;

      if (
        nameLc.includes("patient id") ||
        nameLc.includes("patientid") ||
        nameLc.includes("pid") ||
        nameLc.includes("uhid")
      ) {
        if (value) details.patientId = value;
      }

      if (nameLc.includes("dob") || nameLc.includes("date"))
        details.dob = value;
    });

    if (!details.name) details.name = "Unnamed Patient";

    // ✅ IMPORTANT: build filename AFTER patientId is final
    const fileName = `New_Patient_Form_${details.patientId}.pdf`;

    // ✅ Call your backend API
    await fetch(`${API_BASE}/api/Authentication/SaveFilledForms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base64,
        fileName,
        documentId: details.patientId,
        customerName: details.name,
        username: user?.role || "Admin",
        status: "REGISTERED"
      })
    });

    // ✅ Save patient ONCE, with PDF reference
    const patients = JSON.parse(localStorage.getItem("patients") || "[]");

    if (!patients.some(p => p.patientId === details.patientId)) {
      patients.push({
        ...details,
        formPdf: fileName   // ✅ critical link
      });
      localStorage.setItem("patients", JSON.stringify(patients));
    }

    window.dispatchEvent(new Event("patientsUpdated"));
    onRegister?.(details);

  } finally {
    setIsSubmitting(false);
  }
};


  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      {/* Header */}
<div
  style={{
    padding: "12px 20px",
    textAlign: "center",
    position: "relative"
  }}
>
  {/* <h2 style={{ margin: 0 }}>
    {String(user?.role).toLowerCase() === "lab"
      ? "Doctor Consultation"
      : "New Patient Admission Form"}
  </h2> */}

  {/* Right-side Close button */}
  {/* <button
    onClick={onBack}
    aria-label="Close"
    title="Close"
    style={{
      position: "absolute",
      right: 20,
      top: "50%",
      transform: "translateY(-50%)",
      background: "transparent",
      border: "none",
      fontSize: "20px",
      fontWeight: 600,
      cursor: "pointer",
      lineHeight: 1,
      padding: "4px 8px",
      borderRadius: 6
    }}
    onMouseEnter={(e) =>
      (e.currentTarget.style.background = "#f3f4f6")
    }
    onMouseLeave={(e) =>
      (e.currentTarget.style.background = "transparent")
    }
  >
    ✕
  </button> */}
</div>


      {/* PDF Viewer */}
      <div style={{ flex: 1 }}>
        
<PdfViewerComponent
  id="newPatientFormViewer"
  ref={(v) => (viewerRef.current = v)}
  resourceUrl="https://cdn.syncfusion.com/ej2/31.2.2/dist/ej2-pdfviewer-lib"
  enableToolbar={true}
  created={() => setViewerReady(true)}
resourcesLoaded={handleResourcesLoaded}     // ✅ IMPORTANT
  style={{ width: "100%", height: "100%" }}

        >
          <Inject
            services={[
              Toolbar,
              Magnification,
              Navigation,
              LinkAnnotation,
              BookmarkView,
              ThumbnailView,
              Print,
              TextSelection,
              TextSearch,
              Annotation,
              FormFields,
              FormDesigner,
              PageOrganizer,
            ]}
          />
        </PdfViewerComponent>
      </div>

      {/* Action Bar */}
      <div className="pdf-actionbar">
        <div className="pdf-actionbar-inner">
          <button
            className="button pdf-action-button approve enabled"
            onClick={handlePdfSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Submitting..." : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
