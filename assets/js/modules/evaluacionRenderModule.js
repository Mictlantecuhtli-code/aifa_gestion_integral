import { supabaseDb } from "../supabaseClient.js";

function createInitialState() {
  return {
    currentUser: null,
    roles: [],
    isStudent: false,
    evaluacionId: null,
    evaluacion: null,
    versiones: [],
    preguntas: [],
    intentoActual: null,
    intentosPrevios: [],
    respuestasActuales: [],
    mejorCalificacion: null,
    attemptsRemaining: null,
    isLoading: false,
    pendingVersionId: null,
    ultimoIntento: null
  };
}

function resolveSelectors() {
  return {
    container: document.querySelector("[data-evaluacion-container]") ?? document.querySelector("#evaluacion-module"),
    evaluacionSelect: document.querySelector("[data-evaluacion-select]") ?? document.querySelector("#evaluacion-select"),
    startButton: document.querySelector("[data-evaluacion-start]") ?? document.querySelector("#btn-start-evaluacion"),
    submitButton: document.querySelector("[data-evaluacion-submit]") ?? document.querySelector("#btn-submit-evaluacion"),
    questionList: document.querySelector("[data-evaluacion-questions]") ?? document.querySelector("#evaluacion-questions"),
    instructionsPanel:
      document.querySelector("[data-evaluacion-instrucciones]") ?? document.querySelector("#evaluacion-instrucciones"),
    attemptMessage:
      document.querySelector("[data-evaluacion-intentos]") ?? document.querySelector("#evaluacion-attempt-message"),
    resultPanel: document.querySelector("[data-evaluacion-resultado]") ?? document.querySelector("#evaluacion-result"),
    resultCurrent: document.querySelector("[data-evaluacion-calificacion]") ?? document.querySelector("#evaluacion-result-current"),
    resultBest: document.querySelector("[data-evaluacion-mejor]") ?? document.querySelector("#evaluacion-result-best"),
    resultStatus: document.querySelector("[data-evaluacion-estado]") ?? document.querySelector("#evaluacion-result-status"),
    resultAttempts:
      document.querySelector("[data-evaluacion-restantes]") ?? document.querySelector("#evaluacion-result-attempts"),
    attemptList: document.querySelector("[data-evaluacion-historial]") ?? document.querySelector("#evaluacion-attempt-history"),
    feedbackPanel:
      document.querySelector("[data-evaluacion-feedback]") ?? document.querySelector("#evaluacion-feedback"),
    loader: document.querySelector("[data-evaluacion-loader]") ?? document.querySelector("#evaluacion-loader"),
    examForm: document.querySelector("[data-evaluacion-form]") ?? document.querySelector("#evaluacion-form"),
    moduleTitle: document.querySelector("[data-evaluacion-title]") ?? document.querySelector("#evaluacion-title"),
    moduleDescription:
      document.querySelector("[data-evaluacion-description]") ?? document.querySelector("#evaluacion-description")
  };
}

function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function normalizeString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim().toLowerCase();
}

async function fetchCurrentUser() {
  const {
    data: { user }
  } = await supabaseDb.auth.getUser();
  return user;
}

export const evaluacionRenderModule = {
  state: createInitialState(),
  selectors: resolveSelectors(),

  async init(currentUser = null, { evaluacionId = null } = {}) {
    this.state = createInitialState();
    this.state.currentUser = currentUser ?? (await fetchCurrentUser());
    this.state.evaluacionId = evaluacionId;
    this.selectors = resolveSelectors();

    if (!this.state.currentUser) {
      console.warn("No se encontró un usuario autenticado para el módulo de evaluaciones.");
      return;
    }

    await this.loadUserRoles();
    this.ensureMenuItem();

    if (!this.state.isStudent) {
      console.warn("El módulo de evaluaciones está restringido para usuarios con rol de alumno.");
      return;
    }

    this.registerEvents();

    const inferredEvaluacionId =
      evaluacionId
      ?? this.selectors.container?.dataset?.evaluacionId
      ?? this.selectors.evaluacionSelect?.value
      ?? null;

    if (this.selectors.container && this.state.evaluacionId) {
      this.selectors.container.dataset.evaluacionId = this.state.evaluacionId;
    }

    if (inferredEvaluacionId) {
      await this.loadEvaluacion(inferredEvaluacionId);
    }
  },

  async loadEvaluacion(evaluacionId) {
    if (!evaluacionId) return;

    this.state.isLoading = true;
    this.toggleLoading(true);

    try {
      const { data: evaluacion, error } = await supabaseDb
        .from("evaluaciones")
        .select(
          "id,titulo,descripcion,instrucciones,intentos_max,tiempo_limite,activo,leccion_id,calificacion_minima"
        )
        .eq("id", evaluacionId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!evaluacion || evaluacion.activo === false) {
        this.showMessage(
          "La evaluación seleccionada no se encuentra disponible actualmente. Por favor selecciona otra evaluación."
        );
        return;
      }

      this.state.evaluacionId = evaluacion.id;
      this.state.evaluacion = evaluacion;
      this.state.respuestasActuales = [];

      if (this.selectors.container) {
        this.selectors.container.dataset.evaluacionId = evaluacion.id;
      }

      if (this.selectors.moduleTitle) {
        this.selectors.moduleTitle.textContent = evaluacion.titulo ?? "Evaluación";
      }
      if (this.selectors.moduleDescription) {
        this.selectors.moduleDescription.textContent = evaluacion.descripcion ?? "";
      }
      if (this.selectors.instructionsPanel) {
        this.selectors.instructionsPanel.textContent = evaluacion.instrucciones ?? "";
      }

      await this.loadIntentos();
      await this.loadVersion();
      await this.loadPreguntas();

      this.updateAttemptInformation();
      this.renderExam();
      await this.getBestGrade();
      this.showResult();
    } catch (error) {
      console.error("Error al cargar la evaluación", error);
      this.showMessage("Ocurrió un error al cargar la evaluación. Intenta nuevamente más tarde.");
    } finally {
      this.state.isLoading = false;
      this.toggleLoading(false);
    }
  },

  async loadIntentos() {
    if (!this.state.currentUser || !this.state.evaluacionId) return;

    const { data, error } = await supabaseDb
      .from("evaluaciones_intentos")
      .select("id,version_id,intento_num,fecha_inicio,fecha_fin,calificacion,aprobado,estado")
      .eq("usuario_id", this.state.currentUser.id)
      .eq("evaluacion_id", this.state.evaluacionId)
      .order("fecha_inicio", { ascending: true });

    if (error) {
      console.error("Error al cargar intentos", error);
      this.state.intentosPrevios = [];
      this.state.intentoActual = null;
      return;
    }

    this.state.intentosPrevios = data ?? [];
    this.state.intentoActual = this.state.intentosPrevios.find((intento) => intento.estado === "en_progreso") ?? null;
    this.state.ultimoIntento = this.state.intentosPrevios.length ? this.state.intentosPrevios[this.state.intentosPrevios.length - 1] : null;
    this.state.calificacionActual = this.state.ultimoIntento?.calificacion ?? null;

    const intentosMax = Number(this.state.evaluacion?.intentos_max ?? 0);
    const finalizados = this.state.intentosPrevios.filter((intento) => intento.estado === "terminado").length;
    this.state.attemptsRemaining = intentosMax ? Math.max(intentosMax - finalizados - (this.state.intentoActual ? 1 : 0), 0) : null;
  },

  async loadVersion() {
    if (!this.state.evaluacionId) return;

    if (this.state.intentoActual?.version_id) {
      const existing = this.state.versiones?.find((version) => version.id === this.state.intentoActual.version_id);
      if (existing) {
        this.state.pendingVersionId = existing.id;
        return;
      }
    }

    const { data: versiones, error } = await supabaseDb
      .from("evaluaciones_versiones")
      .select("id,numero_version,preguntas")
      .eq("evaluacion_id", this.state.evaluacionId)
      .order("numero_version", { ascending: true });

    if (error) {
      console.error("Error al obtener versiones de la evaluación", error);
      this.state.versiones = [];
      return;
    }

    this.state.versiones = versiones ?? [];

    if (this.state.intentoActual?.version_id) {
      const version = this.state.versiones.find((item) => item.id === this.state.intentoActual.version_id);
      if (version) {
        this.state.pendingVersionId = version.id;
        return;
      }
    }

    const versionesUtilizadas = new Set(this.state.intentosPrevios.map((intento) => intento.version_id).filter(Boolean));
    const versionDisponible = this.state.versiones.find((version) => !versionesUtilizadas.has(version.id));
    const selected = versionDisponible ?? this.state.versiones[0] ?? null;
    this.state.pendingVersionId = selected?.id ?? null;
  },

  async loadPreguntas() {
    if (!this.state.pendingVersionId) {
      this.state.preguntas = [];
      this.showMessage("No se encontró una versión disponible para esta evaluación.");
      return;
    }

    const version = this.state.versiones.find((item) => item.id === this.state.pendingVersionId);
    if (!version) {
      this.state.preguntas = [];
      this.showMessage("No se pudo determinar la versión del examen.");
      return;
    }

    const preguntasIds = ensureArray(version.preguntas).map((value) => (typeof value === "object" && value?.id ? value.id : value));

    if (!preguntasIds.length) {
      this.state.preguntas = [];
      this.showMessage("La versión asignada no tiene preguntas configuradas.");
      return;
    }

    const { data, error } = await supabaseDb
      .from("banco_preguntas")
      .select("id,enunciado,tipo,opciones,respuesta_correcta,dificultad")
      .in("id", preguntasIds);

    if (error) {
      console.error("Error al cargar preguntas", error);
      this.showMessage("No se pudieron cargar las preguntas de la evaluación.");
      this.state.preguntas = [];
      return;
    }

    const preguntasMap = new Map((data ?? []).map((pregunta) => [pregunta.id, pregunta]));
    this.state.preguntas = preguntasIds
      .map((id) => preguntasMap.get(id))
      .filter((pregunta) => Boolean(pregunta));

    if (!this.state.preguntas.length) {
      this.showMessage("No fue posible obtener las preguntas para esta versión del examen.");
    }
  },

  async startAttempt() {
    if (!this.state.currentUser || !this.state.evaluacionId) return;

    if (this.state.intentoActual) {
      this.showMessage("Tienes un intento en progreso. Continúa respondiendo el examen actual.");
      return;
    }

    const intentosMax = Number(this.state.evaluacion?.intentos_max ?? 0);
    const intentosRealizados = this.state.intentosPrevios.filter((intento) => intento.estado === "terminado").length;
    if (intentosMax && intentosRealizados >= intentosMax) {
      this.showMessage("Ya has utilizado todos los intentos permitidos para esta evaluación.");
      return;
    }

    if (!this.state.pendingVersionId) {
      await this.loadVersion();
      if (!this.state.pendingVersionId) {
        this.showMessage("No hay versiones disponibles para asignar al intento actual.");
        return;
      }
    }

    const intentoNum = this.state.intentosPrevios.length + 1;

    const payload = {
      usuario_id: this.state.currentUser.id,
      evaluacion_id: this.state.evaluacionId,
      version_id: this.state.pendingVersionId,
      intento_num: intentoNum,
      fecha_inicio: new Date().toISOString(),
      estado: "en_progreso"
    };

    const { data, error } = await supabaseDb
      .from("evaluaciones_intentos")
      .insert(payload)
      .select("id,version_id,intento_num,fecha_inicio,fecha_fin,calificacion,aprobado,estado")
      .maybeSingle();

    if (error) {
      console.error("Error al registrar el intento", error);
      this.showMessage("No fue posible iniciar el intento. Inténtalo nuevamente.");
      return;
    }

    this.state.intentoActual = data ?? null;
    if (this.state.intentoActual) {
      this.state.intentosPrevios = [...this.state.intentosPrevios, this.state.intentoActual];
    }

    this.updateAttemptInformation();
    this.renderExam();
  },

  renderExam() {
    const questionsContainer = this.selectors.questionList;
    const submitButton = this.selectors.submitButton;
    const startButton = this.selectors.startButton;

    if (!questionsContainer) return;

    questionsContainer.innerHTML = "";

    if (!this.state.preguntas.length) {
      this.showMessage("No hay preguntas para mostrar en esta evaluación.");
      if (submitButton) submitButton.disabled = true;
      return;
    }

    if (!this.state.intentoActual) {
      this.showMessage("Haz clic en \"Iniciar intento\" para comenzar la evaluación.");
      if (submitButton) submitButton.disabled = true;
      if (startButton) startButton.disabled = false;
      return;
    }

    if (startButton) startButton.disabled = true;
    if (submitButton) submitButton.disabled = false;

    const fragment = document.createDocumentFragment();
    const form = this.selectors.examForm ?? document.createElement("form");

    if (!form.hasAttribute("data-evaluacion-form")) {
      form.setAttribute("data-evaluacion-form", "true");
      form.id = form.id || "evaluacion-form";
      form.classList.add("form", "form--stack");
    } else {
      form.innerHTML = "";
    }

    this.state.preguntas.forEach((pregunta, index) => {
      const fieldset = document.createElement("fieldset");
      fieldset.classList.add("exam-question");
      fieldset.dataset.preguntaId = String(pregunta.id);

      const legend = document.createElement("legend");
      legend.classList.add("exam-question__title");
      legend.textContent = `${index + 1}. ${pregunta.enunciado ?? "Pregunta"}`;
      fieldset.append(legend);

      const type = String(pregunta.tipo ?? "").toLowerCase();
      if (type === "opcion_multiple") {
        this.renderMultipleChoice(fieldset, pregunta);
      } else if (type === "vf" || type === "verdadero/falso" || type === "verdadero_falso") {
        this.renderTrueFalse(fieldset, pregunta);
      } else {
        this.renderOpenQuestion(fieldset, pregunta);
      }

      form.append(fieldset);
    });

    const submitWrapper = document.createElement("div");
    submitWrapper.classList.add("exam-actions");
    const submit = this.selectors.submitButton ?? document.createElement("button");

    if (!this.selectors.submitButton) {
      submit.type = "submit";
      submit.id = "btn-submit-evaluacion";
      submit.classList.add("btn", "btn--primary");
      submit.textContent = "Enviar evaluación";
      submitWrapper.append(submit);
      form.append(submitWrapper);
      this.selectors.submitButton = submit;
      submit.addEventListener("click", (event) => this.submitExam(event));
    }

    fragment.append(form);

    const formWasMissing = !this.selectors.examForm;

    if (!this.selectors.examForm) {
      questionsContainer.append(fragment);
      this.selectors.examForm = form;
    } else {
      questionsContainer.replaceChildren(fragment);
      this.selectors.examForm = questionsContainer.querySelector("form[data-evaluacion-form]") ?? form;
    }

    if (formWasMissing && this.selectors.examForm) {
      this.selectors.examForm.addEventListener("submit", (event) => this.submitExam(event));
    }

    this.showMessage("Responde todas las preguntas y envía la evaluación para obtener tu calificación.");
  },

  renderMultipleChoice(fieldset, pregunta) {
    const opciones = Array.isArray(pregunta.opciones) ? pregunta.opciones : [];
    const list = document.createElement("div");
    list.classList.add("exam-question__options");

    opciones.forEach((opcion, idx) => {
      const value =
        (typeof opcion === "object" && (opcion.valor ?? opcion.id))
        ?? (typeof opcion === "string" ? opcion : String(idx));
      const label =
        (typeof opcion === "object" && (opcion.texto ?? opcion.label))
        ?? (typeof opcion === "string" ? opcion : `Opción ${idx + 1}`);

      const optionId = `q-${pregunta.id}-${idx}`;
      const wrapper = document.createElement("label");
      wrapper.classList.add("exam-option");

      const input = document.createElement("input");
      input.type = "radio";
      input.name = `question-${pregunta.id}`;
      input.value = String(value);
      input.id = optionId;
      input.required = true;

      const span = document.createElement("span");
      span.textContent = label;

      wrapper.append(input, span);
      list.append(wrapper);
    });

    fieldset.append(list);
  },

  renderTrueFalse(fieldset, pregunta) {
    const list = document.createElement("div");
    list.classList.add("exam-question__options");

    [
      { value: "verdadero", label: "Verdadero" },
      { value: "falso", label: "Falso" }
    ].forEach((opcion) => {
      const optionId = `q-${pregunta.id}-${opcion.value}`;
      const wrapper = document.createElement("label");
      wrapper.classList.add("exam-option");

      const input = document.createElement("input");
      input.type = "radio";
      input.name = `question-${pregunta.id}`;
      input.value = opcion.value;
      input.id = optionId;
      input.required = true;

      const span = document.createElement("span");
      span.textContent = opcion.label;

      wrapper.append(input, span);
      list.append(wrapper);
    });

    fieldset.append(list);
  },

  renderOpenQuestion(fieldset, pregunta) {
    const textarea = document.createElement("textarea");
    textarea.name = `question-${pregunta.id}`;
    textarea.rows = 4;
    textarea.required = true;
    textarea.placeholder = "Escribe tu respuesta";
    fieldset.append(textarea);
  },

  async submitExam(event) {
    if (event) {
      event.preventDefault();
    }

    if (!this.state.intentoActual) {
      this.showMessage("Debes iniciar un intento antes de enviar la evaluación.");
      return;
    }

    if (!this.selectors.examForm) {
      this.showMessage("No se encontró el formulario de evaluación.");
      return;
    }

    const responses = [];
    const formData = new FormData(this.selectors.examForm);

    for (const pregunta of this.state.preguntas) {
      const fieldName = `question-${pregunta.id}`;
      const rawValue = formData.get(fieldName);
      const answer = rawValue !== null ? String(rawValue) : null;

      if (answer === null || answer === "") {
        this.showMessage("Responde todas las preguntas antes de enviar la evaluación.");
        return;
      }

      const correcta = this.evaluateAnswer(pregunta, answer);
      const respuestaPayload = this.buildRespuestaPayload(pregunta, answer);

      responses.push({
        intento_id: this.state.intentoActual.id,
        pregunta_id: pregunta.id,
        respuesta: respuestaPayload,
        correcta
      });
    }

    try {
      const { error } = await supabaseDb.from("evaluaciones_respuestas").insert(responses);
      if (error) {
        throw error;
      }

      this.state.respuestasActuales = responses;

      await this.gradeExam();
      await this.getBestGrade();
      await this.loadIntentos();
      await this.loadVersion();
      await this.loadPreguntas();
      this.renderExam();

      this.updateAttemptInformation();
      this.showResult();
    } catch (error) {
      console.error("Error al guardar las respuestas de la evaluación", error);
      this.showMessage("Ocurrió un error al enviar tus respuestas. Intenta nuevamente.");
    }
  },

  evaluateAnswer(pregunta, answer) {
    const type = String(pregunta.tipo ?? "").toLowerCase();
    const expected = pregunta.respuesta_correcta;

    if (type === "opcion_multiple") {
      const expectedValues = ensureArray(expected).map((value) => normalizeString(typeof value === "object" ? value?.valor ?? value?.id : value));
      const normalizedAnswer = normalizeString(answer);
      return expectedValues.includes(normalizedAnswer);
    }

    if (type === "vf" || type === "verdadero/falso" || type === "verdadero_falso") {
      const normalizedExpected = normalizeString(
        typeof expected === "object" && expected !== null ? expected?.valor ?? expected?.respuesta ?? expected : expected
      );
      const normalizedAnswer = normalizeString(answer);
      return normalizedExpected ? normalizedExpected === normalizedAnswer : false;
    }

    if (type === "abierta") {
      if (!expected) return false;
      const posibles = ensureArray(expected).map((value) => normalizeString(value));
      return posibles.includes(normalizeString(answer));
    }

    return false;
  },

  buildRespuestaPayload(pregunta, answer) {
    const type = String(pregunta.tipo ?? "").toLowerCase();

    if (type === "opcion_multiple") {
      return { seleccion: answer };
    }

    if (type === "vf" || type === "verdadero/falso" || type === "verdadero_falso") {
      return { valor: answer };
    }

    return { texto: answer };
  },

  async gradeExam() {
    const totalPreguntas = this.state.preguntas.length;
    if (!totalPreguntas) {
      this.state.calificacionActual = 0;
      return;
    }

    const aciertos = this.state.respuestasActuales.filter((respuesta) => respuesta.correcta).length;
    const calificacion = totalPreguntas > 0 ? (aciertos / totalPreguntas) * 100 : 0;
    const calificacionFinal = Math.round(calificacion * 100) / 100;
    const passingScore = Number(this.state.evaluacion?.calificacion_minima ?? 0) || 80;
    const aprobado = calificacionFinal >= passingScore;

    const { error } = await supabaseDb
      .from("evaluaciones_intentos")
      .update({
        fecha_fin: new Date().toISOString(),
        calificacion: calificacionFinal,
        aprobado,
        estado: "terminado"
      })
      .eq("id", this.state.intentoActual.id);

    if (error) {
      console.error("Error al actualizar la calificación del intento", error);
      this.showMessage("No se pudo registrar la calificación del intento.");
      return;
    }

    const intentoActualizado = {
      ...this.state.intentoActual,
      fecha_fin: new Date().toISOString(),
      calificacion: calificacionFinal,
      aprobado,
      estado: "terminado"
    };

    this.state.intentoActual = intentoActualizado;
    this.state.ultimoIntento = intentoActualizado;
    this.state.calificacionActual = calificacionFinal;
  },

  async getBestGrade() {
    if (!this.state.currentUser || !this.state.evaluacionId) return;

    const { data: mejor, error } = await supabaseDb
      .from("evaluaciones_intentos")
      .select("calificacion")
      .eq("usuario_id", this.state.currentUser.id)
      .eq("evaluacion_id", this.state.evaluacionId);

    if (error) {
      console.error("Error al consultar la mejor calificación", error);
      this.state.mejorCalificacion = null;
      return;
    }

    const mejorCalificacion = Math.max(...(mejor ?? []).map((entry) => Number(entry.calificacion ?? 0)));
    this.state.mejorCalificacion = Number.isFinite(mejorCalificacion) ? mejorCalificacion : 0;
  },

  showResult() {
    const resultPanel = this.selectors.resultPanel;
    if (!resultPanel) return;

    const intentosRegistrados = this.state.intentosPrevios?.length ?? 0;
    const intentoReferencia = this.state.intentoActual?.estado === "en_progreso" ? this.state.intentoActual : this.state.ultimoIntento;
    const tieneResultados = intentosRegistrados > 0 || this.state.respuestasActuales.length > 0 || intentoReferencia;

    if (!tieneResultados) {
      resultPanel.classList.add("is-hidden");
      return;
    }

    if (this.selectors.resultCurrent) {
      const calificacion =
        this.state.calificacionActual ?? intentoReferencia?.calificacion ?? (intentosRegistrados ? intentoReferencia?.calificacion ?? 0 : 0);
      this.selectors.resultCurrent.textContent = `${Number(calificacion ?? 0).toFixed(2)} / 100`;
    }

    if (this.selectors.resultBest && this.state.mejorCalificacion !== null) {
      this.selectors.resultBest.textContent = `${(this.state.mejorCalificacion ?? 0).toFixed(2)} / 100`;
    }

    const attemptsRemaining = this.state.attemptsRemaining;
    if (this.selectors.resultAttempts) {
      if (attemptsRemaining === null) {
        this.selectors.resultAttempts.textContent = "Intentos ilimitados";
      } else {
        this.selectors.resultAttempts.textContent = `${attemptsRemaining} intento(s) restante(s)`;
      }
    }

    if (this.selectors.resultStatus && intentoReferencia) {
      const aprobado = Boolean(intentoReferencia.aprobado);
      this.selectors.resultStatus.textContent = aprobado ? "Aprobado" : "No aprobado";
      this.selectors.resultStatus.classList.toggle("badge--success", aprobado);
      this.selectors.resultStatus.classList.toggle("badge--danger", !aprobado);
    }

    if (this.selectors.feedbackPanel) {
      const aprobado = Boolean(intentoReferencia?.aprobado);
      if (this.state.respuestasActuales.length) {
        this.selectors.feedbackPanel.textContent = aprobado
          ? "¡Felicidades! Has aprobado esta evaluación."
          : "Puedes revisar tus respuestas y volver a intentarlo si cuentas con intentos disponibles.";
      } else {
        this.selectors.feedbackPanel.textContent = aprobado
          ? "Tu mejor calificación registrada es aprobatoria."
          : "Aún no has aprobado esta evaluación. Puedes intentar nuevamente si tienes intentos disponibles.";
      }
    }

    resultPanel.classList.remove("is-hidden");
    if (this.state.respuestasActuales.length) {
      this.showMessage("Tu intento se registró correctamente. Consulta tus resultados abajo.");
    }
  },

  updateAttemptInformation() {
    const messageTarget = this.selectors.attemptMessage;
    if (!messageTarget) return;

    const intentosMax = Number(this.state.evaluacion?.intentos_max ?? 0);
    const finalizados = this.state.intentosPrevios.filter((intento) => intento.estado === "terminado").length;
    const enProgreso = Boolean(this.state.intentoActual);

    if (intentosMax) {
      const restantes = Math.max(intentosMax - finalizados - (enProgreso ? 1 : 0), 0);
      messageTarget.textContent = enProgreso
        ? `Intento ${this.state.intentoActual?.intento_num ?? ""} en curso. Intentos restantes: ${restantes}.`
        : `Has completado ${finalizados} de ${intentosMax} intento(s). Intentos disponibles: ${restantes}.`;
    } else {
      messageTarget.textContent = enProgreso
        ? `Intento ${this.state.intentoActual?.intento_num ?? ""} en curso.`
        : `No hay un límite configurado de intentos para esta evaluación.`;
    }

    if (this.selectors.startButton) {
      const remaining = intentosMax ? Math.max(intentosMax - finalizados, 0) : Infinity;
      this.selectors.startButton.disabled = enProgreso || remaining <= 0;
    }
  },

  showMessage(message) {
    const container = this.selectors.feedbackPanel ?? this.selectors.container;
    if (!container) return;

    if (this.selectors.feedbackPanel) {
      this.selectors.feedbackPanel.textContent = message;
    } else {
      container.setAttribute("data-status-message", message);
    }
  },

  toggleLoading(isLoading) {
    if (!this.selectors.loader) return;
    this.selectors.loader.classList.toggle("is-active", Boolean(isLoading));
  },

  registerEvents() {
    this.selectors.startButton?.addEventListener("click", () => this.startAttempt());

    if (this.selectors.examForm) {
      this.selectors.examForm.addEventListener("submit", (event) => this.submitExam(event));
    }

    this.selectors.submitButton?.addEventListener("click", (event) => this.submitExam(event));

    this.selectors.evaluacionSelect?.addEventListener("change", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      const selectedId = target.value;
      if (!selectedId) return;
      await this.loadEvaluacion(selectedId);
    });
  },

  async loadUserRoles() {
    if (!this.state.currentUser) return;

    const { data, error } = await supabaseDb
      .from("usuarios_roles")
      .select("roles:rol_id(nombre)")
      .eq("usuario_id", this.state.currentUser.id);

    if (error) {
      console.error("Error al obtener los roles del usuario", error);
      this.state.roles = [];
      this.state.isStudent = false;
      return;
    }

    this.state.roles = (data ?? []).map((entry) => entry.roles?.nombre).filter(Boolean);
    this.state.isStudent = this.state.roles.some((role) => normalizeString(role) === "alumno");
  },

  ensureMenuItem() {
    const menuSelectors = [
      "[data-student-menu]",
      "[data-menu='alumno']",
      "[data-role='alumno']",
      "#student-menu",
      "#alumno-menu"
    ];

    const container = menuSelectors
      .map((selector) => document.querySelector(selector))
      .find((element) => element instanceof HTMLElement);

    if (!container) {
      return;
    }

    let item = container.querySelector("li.menu-item[data-module='evaluacionRenderModule']");
    if (!item) {
      item = document.createElement("li");
      item.classList.add("menu-item");
      item.dataset.module = "evaluacionRenderModule";

      const link = document.createElement("a");
      link.href = "#";
      link.textContent = "Tomar Evaluación";
      link.dataset.action = "load-evaluacion-module";

      item.append(link);
      container.append(item);
    }

    const link = item.querySelector("a[data-action='load-evaluacion-module']");
    if (link && !link.dataset.bound) {
      link.dataset.bound = "true";
      link.addEventListener("click", (event) => {
        event.preventDefault();
        if (typeof window.loadModule === "function") {
          window.loadModule("evaluacionRenderModule");
        }
      });
    }

    if (!this.state.isStudent) {
      item.setAttribute("hidden", "true");
    } else {
      item.removeAttribute("hidden");
    }
  }
};

if (typeof window !== "undefined") {
  window.evaluacionRenderModule = evaluacionRenderModule;
}
