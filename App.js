import React, { useState } from "react";

import DogActivityPage from "./DogActivityPage";
import TrainingPage from "./TrainingPage";

function App() {
  const [page, setPage] = useState("training");

  if (page === "dogActivity") {
    return <DogActivityPage onBack={() => setPage("training")} />;
  }

  return <TrainingPage onOpenDogActivity={() => setPage("dogActivity")} />;
}

export default App;
