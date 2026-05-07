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
  const alertedFieldsRef = useRef(new Set());
  const sanitizerAttachedRef = useRef(false);
  const sanitizerHandlerRef = useRef(null);
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

  // canonical editable field names and rule groups (used by sanitizer)
  const ADMIN_EDITABLE_FIELDS = [
    "name",
    "lastname",
    "gender",
    "age",
    "phone",
    "anumber",
    "address",
    "physician",
    "time",
    "visit",
    "previousvisit",
    "nextvisit",
    "bp",
    "temperature",
    "pulse",
    "height",
    "weight",
    "bmi",
    "systolic",
    "diastolic",
    "date",
  ];

  const ALPHA_FIELDS = new Set(["name","lastname","gender","physician","address","time","visit","previousvisit"]);
  const NUMERIC_FIELDS = new Set(["age","bp","temperature","pulse","height","weight","bmi","systolic","diastolic"]);
  const PHONE_FIELDS = new Set(["phone","anumber"]);
  const DATE_FIELDS = new Set(["date","nextvisit"]);

  // ✅ ADD THIS HELPER FUNCTION (anywhere inside the component)
  const applyAdminReadOnlyRules = () => {
    if (user?.role !== "Admin") return;

    try {
      const viewer = viewerRef.current?.ej2Instances || viewerRef.current;
      if (!viewer) return;

      let fields = viewer.formFieldCollections || viewer.retrieveFormFields?.() || [];
      if (!fields) return;

      const normalized = Array.isArray(fields) ? fields : Object.values(fields);
      normalized.forEach((field) => {
        if (!field) return;
        const name = (field.name || "").toLowerCase();
        const shouldBeEditable = ADMIN_EDITABLE_FIELDS.includes(name);
        try {
          viewer.formDesignerModule?.updateFormField(field.id, {
            isReadOnly: !shouldBeEditable,
            isEnabled: shouldBeEditable,
          });
        } catch (e) {}
      });
    } catch (e) {}
  };

// Call this when form field properties change (wired like `resourcesLoaded`).
const handleFormFieldPropertiesChange = (args) => {
  try {
    // ensure sanitizer attached for live typing
    attachLiveFieldSanitizer(args);
  } catch (e) {
    // swallow errors to avoid disrupting typing
  }
};

const evaluateFields = () => {
  // stub: no-op in this integration (kept for parity with original logic)
};

const documentLoad = async () => {
  try {
    // ✅ Wait for form fields to be fully initialized
    await new Promise(resolve => setTimeout(resolve, 500));
    applyAdminReadOnlyRules();
    // ensure sanitizer is attached after document load
    attachLiveFieldSanitizer();
  } catch (e) {
  }
};
  const handleResourcesLoaded = async () => {
    try {
      const viewer =
        viewerRef.current?.ej2Instances || viewerRef.current;
      if (!viewer) {
        return;
      }

      // Prevent duplicate loads; we'll mark as loaded only after success
      if (pdfLoadedRef.current) return;

      const filename = effectivePdfName.toLowerCase().endsWith(".pdf")
        ? effectivePdfName
        : `${effectivePdfName}.pdf`;

      const resp = await fetch(
        `${API_BASE}/api/Authentication/GetPdfStream/${encodeURIComponent(filename)}`
      );

      if (!resp.ok) {
        console.warn('resourcesLoaded: fetch failed', resp.status, resp.statusText);
        return;
      }

      const contentType = (resp.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('pdf')) {
        console.warn('resourcesLoaded: content-type is not PDF', contentType);
        return;
      }

      const blob = await resp.blob();
      if (!blob || blob.size === 0) {
        console.warn('resourcesLoaded: received empty blob for', filename);
        return;
      }

      const url = URL.createObjectURL(blob);

      // Small delay to ensure viewer is fully initialized
      await new Promise(resolve => setTimeout(resolve, 100));

      // Try load first, fallback to open. Revoke URL after handing to viewer.
      try {
        if (viewer.load) {
          setTimeout(() => {
            try { viewer.load(url, null); } catch (e) { console.warn('viewer.load failed', e); }
            try { URL.revokeObjectURL(url); } catch (e) {}
          }, 600);
        } else if (viewer.open) {
          try { viewer.open(url); } catch (e) { console.warn('viewer.open failed', e); }
          // revoke after a short delay to let viewer fetch
          setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 1000);
        } else {
          try { URL.revokeObjectURL(url); } catch (e) {}
          return;
        }

        // mark loaded only after handing the blob/URL to the viewer
        pdfLoadedRef.current = true;
      } catch (e) {
        try { URL.revokeObjectURL(url); } catch (er) {}
        throw e;
      }
    } catch (e) {
      console.warn('handleResourcesLoaded error', e);
    }
  };


const attachLiveFieldSanitizer = () => {
  const viewer = viewerRef.current?.ej2Instances || viewerRef.current;
  if (!viewer) return;

  const getFields = () =>
    viewer.retrieveFormFields?.() ||
    viewer.pdfViewer?.retrieveFormFields?.() ||
    [];

  const sanitizeValue = (name, value) => {
    const n = (name || "").toString().toLowerCase();
    let v = String(value || "");
    const last = (n.split(/\.|\[|\]/).filter(Boolean).pop() || n).toLowerCase();

    if (ALPHA_FIELDS.has(last) || ALPHA_FIELDS.has(n) || /\b(name|last ?name|gender|physician|address|visit|time)\b/.test(n)) {
      v = v.replace(/[^a-zA-Z\s]/g, "");
    } else if (NUMERIC_FIELDS.has(last) || NUMERIC_FIELDS.has(n) || /\b(age|number|no|tenure|amount|amt|pid|uhid)\b/.test(n)) {
      v = v.replace(/[^0-9]/g, "");
    } else if (PHONE_FIELDS.has(last) || PHONE_FIELDS.has(n) || /\b(phone|mobile|contact|alt|anumber)\b/.test(n)) {
      v = v.replace(/[^0-9]/g, "").slice(0, 10);
    } else if (DATE_FIELDS.has(last) || DATE_FIELDS.has(n) || n.includes("date") || n.includes("dob")) {
      v = v.replace(/[^0-9\/\-.]/g, "");
    }

    return v;
  };

  viewer.formFieldValueChanged = (args) => {
    try {
      if (!args?.isValueChanged) return;

      const rawName =
        args.field?.name ||
        args.fieldName ||
        args.name ||
        "";

      const rawValue =
        args.value ??
        args.newValue ??
        args.field?.value ??
        "";

      if (!rawName) return;

      const cleaned = sanitizeValue(rawName, String(rawValue));
      if (cleaned === String(rawValue)) return;

      // ✅ CRITICAL: defer update to next tick
      requestAnimationFrame(() => {
        try {
          const fields = getFields() || [];
          const rn = rawName.toString().toLowerCase();
          const field = fields.find(f => {
            const fn = (f.name || f.fieldName || "").toString().toLowerCase();
            if (!fn) return false;
            if (fn === rn) return true;
            const fnLast = fn.split(/\.|\[|\]/).filter(Boolean).pop() || fn;
            const rnLast = rn.split(/\.|\[|\]/).filter(Boolean).pop() || rn;
            if (fnLast === rnLast) return true;
            if (fn.endsWith('.' + rnLast) || fn.endsWith('_' + rnLast)) return true;
            return false;
          }) || null;

          const tryUpdate = (target) => {
            try {
              if (viewer.formDesignerModule?.updateFormFieldsValue) {
                // API shape: updateFormFieldsValue(id, { value })
                viewer.formDesignerModule.updateFormFieldsValue(target, { value: cleaned });
                return true;
              }
              if (viewer.formDesignerModule?.updateFormField) {
                viewer.formDesignerModule.updateFormField(target, { value: cleaned });
                return true;
              }
              if (typeof viewer.updateFormFieldsValue === 'function') {
                // some viewer versions accept (name, value)
                viewer.updateFormFieldsValue(target, cleaned);
                return true;
              }
              if (typeof viewer.updateFormField === 'function') {
                viewer.updateFormField(target, { value: cleaned });
                return true;
              }
            } catch (e) {}
            return false;
          };

          if (field && !((field.type || field.fieldType || "").toString().toLowerCase().includes('signature'))) {
            // prefer id when available, otherwise name
            const primary = field.id || field.name || rawName;
            if (!tryUpdate(primary)) {
              tryUpdate({ name: field.name || rawName });
            }
          } else {
            // fallback: attempt update by raw name, then args.value, then DOM
            if (!tryUpdate(rawName)) {
              if ('value' in args) args.value = cleaned;
              try {
                const sel = `input[name="${rawName}"], input[id="${rawName}"], textarea[name="${rawName}"], textarea[id="${rawName}"]`;
                const el = document.querySelector(sel);
                if (el) el.value = cleaned;
              } catch (e) {}
            }
          }
        } catch {}
      });
    } catch {}
  };

  // Add a delegated input listener as a robust fallback (fires during typing)
  try {
    if (!sanitizerAttachedRef.current) {
      const container = document.getElementById('newPatientFormViewer') || viewer.element || viewer.container || document.body;

      const delegated = (ev) => {
        try {
          const el = ev.target;
          if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
          if (!container.contains(el)) return;

          const name = (el.getAttribute('name') || el.getAttribute('id') || el.dataset?.name || '').toString();
          if (!name) return;
          const before = el.value || '';
          const cleaned = sanitizeValue(name, before);
          if (cleaned === before) return;
          // apply immediately to DOM so user sees sanitized value
          el.value = cleaned;

          // attempt to update viewer model as well
          try {
            if (viewer.formDesignerModule?.updateFormField) {
              viewer.formDesignerModule.updateFormField({ name }, { value: cleaned });
            } else if (typeof viewer.updateFormFieldsValue === 'function') {
              viewer.updateFormFieldsValue(name, cleaned);
            } else if (typeof viewer.updateFormField === 'function') {
              viewer.updateFormField(name, { value: cleaned });
            }
          } catch (e) {}
        } catch (e) {}
      };

      sanitizerHandlerRef.current = delegated;
      container.addEventListener('input', delegated, true);
      sanitizerAttachedRef.current = true;
    }
  } catch (e) {}
};

// cleanup delegated listener on unmount
useEffect(() => {
  return () => {
    try {
      if (sanitizerAttachedRef.current && sanitizerHandlerRef.current) {
        const viewer = viewerRef.current?.ej2Instances || viewerRef.current;
        const container = document.getElementById('newPatientFormViewer') || (viewer && (viewer.element || viewer.container)) || document.body;
        container.removeEventListener('input', sanitizerHandlerRef.current, true);
      }
    } catch (e) {}
  };
}, []);
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

  const getToolbarSettingsForNewPatient = () => {
  if (user?.role === "Admin") {
    return {
      showTooltip: true,
      toolbarItems: [
        "PageNavigationTool",
        "PanTool",
        "MagnificationTool"
      ]
    };
  }

  // fallback (if ever needed)
  return {
    showTooltip: true,
    toolbarItems: [
      "PageNavigationTool",
      "PanTool",
      "MagnificationTool",
      "DownloadOption",
      "PrintOption"
    ]
  };
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
      </div>
      {/* PDF Viewer */}
      <div style={{ flex: 1 }}>
        <PdfViewerComponent
          id="newPatientFormViewer"
          ref={(inst) => {
            viewerRef.current = inst;
          }}
          resourceUrl="https://cdn.syncfusion.com/ej2/31.2.2/dist/ej2-pdfviewer-lib"
          enableToolbar={true}
          toolbarSettings={getToolbarSettingsForNewPatient()}
          created={() => {
            setViewerReady(true);
          }}
          resourcesLoaded={handleResourcesLoaded}
          documentLoad={documentLoad}
          formFieldPropertiesChange={handleFormFieldPropertiesChange}
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
