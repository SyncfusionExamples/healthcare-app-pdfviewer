import React, { useState } from "react";
import Login from "./Login.jsx";
import Dashboard from "./Dashboard.jsx";
import PdfViewerPage from "./Pdfviewerpage.jsx";
import PdfNewPatientForm from "./PdfNewPatientForm.jsx";
import "./index.css";

export default function App() {
  const [user, setUser] = useState(null);
  const [route, setRoute] = useState("login");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [selectedPdfName, setSelectedPdfName] = useState(null);

 

const handleLogin = (role) => {
  const user = { role };
  setUser(user);
  localStorage.setItem("user", JSON.stringify(user));
  setRoute("dashboard");   // ← THIS WAS MISSING
};



  const gotoViewer = (patient, pdfName) => {
    setSelectedPatient(patient);
    // ✅ Priority: use passed pdfName, fallback to patient.formPdf, fallback to default
    const finalPdfName = pdfName || patient?.formPdf || null;
    console.log("gotoViewer - Patient:", patient?.patientId, "PDF Name:", finalPdfName);
    setSelectedPdfName(finalPdfName);
    setRoute("viewer");
  };

  const gotoPrescription = (patient) => {
    setSelectedPatient(patient);
    setRoute("prescription");
  };

  return (
    <div className="app">
      {route !== "login" && <Header user={user} onLogout={() => setRoute("login")} />}

      <main>

        {route === "login" && (
          <div className="login-center-wrapper">
            {/* <h1 className="login-center-title">Healthcare Workflow</h1> */}
            <Login onLogin={handleLogin} />
          </div>
        )}

        {route === "dashboard" && user && (
          <Dashboard
            user={user}
            onOpenReport={gotoViewer}
            onOpenPrescription={gotoPrescription}
            onNewPatient={() => setRoute("newPatientForm")}
          />
        )}

      
{route === "newPatientForm" && (
  <PdfNewPatientForm
    user={user}                     // ✅ REQUIRED
    onBack={() => setRoute("dashboard")}
    onRegister={() => {
      // ✅ DO NOT save again here
      setRoute("dashboard");
    }}
  />
)}


        {route === "viewer" && user && selectedPatient && (
          <PdfViewerPage
            user={user}
            patient={selectedPatient}
            onBack={() => setRoute("dashboard")}
            pdfFileName={selectedPdfName || 'New_Patient_Form'}
          />
        )}

      </main>

      {route !== "login"}
    </div>
  );
}

function Header({ user, onLogout }) {
  if (!user) return null;

  return (
    <header className="top-header">
      <div className="left">{user.role}</div>

      <button className="logout-btn" onClick={onLogout}>
        Logout
      </button>
    </header>
  );
}

// function Footer() {
//   return (
//     <footer className="app-footer">
//       <span>© {new Date().getFullYear()} Healthcare Demo</span>
//     </footer>
//   );
// }