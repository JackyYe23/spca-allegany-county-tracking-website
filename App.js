import React, { useState } from "react";

import DogActivityPage from "./dog-activity/DogActivityPage";
import TrainingPage from "./training-page/TrainingPage";

function App() {
  const [page, setPage] = useState("training");

  if (page === "dogActivity") {
    return <DogActivityPage onBack={() => setPage("training")} />;
  }

  return <TrainingPage onOpenDogActivity={() => setPage("dogActivity")} />;
}

export default App;
