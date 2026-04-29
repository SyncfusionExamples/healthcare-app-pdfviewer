import React, { useState } from "react";
import "./login.css";

export default function Login({ onLogin }) {
  const [role, setRole] = useState("Admin");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    onLogin(role);
  };

  return (
    <div className="login-card">
      <div className="brand">
        <div className="brand-text">
        </div>
      </div>

      <form className="login-form" onSubmit={submit}>
        <label className="field">
          <h1>Login</h1>
          {/* <span>Role</span> */}
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option>Admin</option>
            <option>Doctor</option>
            <option>Lab</option>
          </select>
        </label>

       
        <button className="btn primary" type="submit">Login</button>
      </form>

     
    </div>
  );
}