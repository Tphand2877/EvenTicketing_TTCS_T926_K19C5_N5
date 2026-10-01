import { useEffect, useState } from "react";
import Header from "../components/common/Header";
import apiClient from "../services/apiClient";

function HomePage() {
  const [backendStatus, setBackendStatus] = useState("checking...");
 

  useEffect(() => {
    apiClient("/health")
      .then((data) => {
        setBackendStatus(data.status);
      })
      .catch(() => {
        setBackendStatus("error");
      });
  }, []);

  return (
    <div>
      <Header />

      <main>
        <h1>Home</h1>
        <p>Welcome to the Event Ticketing application.</p>

        <p>Backend status: {backendStatus}</p>
      </main>
    </div>
  );
}

export default HomePage;
