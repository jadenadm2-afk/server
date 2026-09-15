/**
 * ================================================================
 *  نظام إدارة وتفاعل استمارة استبيان زالنجي الميداني
 *  Zalingei Academic Field Survey Interactions & Engine
 * ================================================================
 */

let currentStep = 1;
const totalSteps = 5;
let currentViewMode = 'full'; // 'full' (الصفحة كاملة - الوضع الافتراضي) أو 'wizard' (خطوة بخطوة)

// عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    // تشغيل وضع العرض الكامل افتراضياً لظهور جميع المحاور والتعديلات مباشرة
    setViewMode('full');

    // تفعيل رصد التغييرات لحساب شريط التقدم تلقائياً
    const form = document.getElementById('surveyForm');
    if (form) {
        form.addEventListener('change', updateProgress);
        form.addEventListener('input', updateProgress);
    }

    // تهيئة حالة الخيارات المحددة مسبقاً إن وجدت
    initializeSelectedStates();
    updateProgress();

    // رصد التمرير لتحديث التبويب النشط في وضع الصفحة الكاملة
    window.addEventListener('scroll', handleScrollTabSync, { passive: true });
});

/**
 * تبديل نمط العرض بين (الصفحة كاملة) و (خطوة بخطوة)
 */
function setViewMode(mode) {
    currentViewMode = mode;
    const card = document.getElementById('cardContainer');
    const btnFull = document.getElementById('btnModeFull');
    const btnWizard = document.getElementById('btnModeWizard');

    if (!card) return;

    if (mode === 'full') {
        card.classList.remove('view-wizard');
        card.classList.add('view-full');
        if (btnFull) btnFull.classList.add('active');
        if (btnWizard) btnWizard.classList.remove('active');
    } else {
        card.classList.remove('view-full');
        card.classList.add('view-wizard');
        if (btnFull) btnFull.classList.remove('active');
        if (btnWizard) btnWizard.classList.add('active');
        showStep(currentStep);
    }
    updateTabsState(currentStep);
}

/**
 * الانتقال السريع للمحور المحدد (عبر التبويبات العلوية)
 */
function navToTab(stepNum) {
    currentStep = stepNum;
    updateTabsState(stepNum);

    if (currentViewMode === 'full') {
        // تمرير سلس ومباشر للمحور المطلوب
        const targetSection = document.getElementById(`step${stepNum}`);
        if (targetSection) {
            const yOffset = -80; // تعويض لشريط الترويسة
            const y = targetSection.getBoundingClientRect().top + window.pageYOffset + yOffset;
            window.scrollTo({ top: y, behavior: 'smooth' });

            // تمييز بصري سريع للقسم المطلوب
            targetSection.style.transition = 'background 0.5s ease';
            targetSection.style.backgroundColor = 'rgba(45, 106, 79, 0.05)';
            setTimeout(() => {
                targetSection.style.backgroundColor = 'transparent';
            }, 1000);
        }
    } else {
        showStep(stepNum);
    }
}

/**
 * تحديث حالة التبويب النشط
 */
function updateTabsState(activeNum) {
    document.querySelectorAll('.tab-btn').forEach((btn, idx) => {
        if (idx + 1 === activeNum) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

/**
 * مزامنة التبويب النشط أثناء التمرير في وضع الصفحة الكاملة
 */
function handleScrollTabSync() {
    if (currentViewMode !== 'full') return;
    const scrollPos = window.scrollY + 200;

    for (let i = 1; i <= totalSteps; i++) {
        const sec = document.getElementById(`step${i}`);
        if (sec) {
            const top = sec.offsetTop;
            const height = sec.offsetHeight;
            if (scrollPos >= top && scrollPos < top + height) {
                updateTabsState(i);
                break;
            }
        }
    }
}

/**
 * تحديد بطاقات الاختيارات المتعددة (البيانات الديموغرافية)
 */
function selectCardOption(labelElem) {
    const input = labelElem.querySelector('input');
    if (!input) return;

    if (input.type === 'radio') {
        const parentStack = labelElem.closest('.options-stack') || labelElem.parentElement;
        if (parentStack) {
            parentStack.querySelectorAll('.option-card').forEach(card => {
                card.classList.remove('selected');
            });
        }
        input.checked = true;
        labelElem.classList.add('selected');
    } else if (input.type === 'checkbox') {
        input.checked = !input.checked;
        if (input.checked) {
            labelElem.classList.add('selected');
        } else {
            labelElem.classList.remove('selected');
        }
    }

    updateProgress();
}

/**
 * تحديد خيارات مقياس ليكرت (المحاور الأربعة)
 */
function selectLikertOption(labelElem) {
    const input = labelElem.querySelector('input[type="radio"]');
    if (!input) return;

    const parentScale = labelElem.closest('.likert-scale');
    if (parentScale) {
        parentScale.querySelectorAll('.likert-option').forEach(opt => {
            opt.classList.remove('selected');
        });
    }

    input.checked = true;
    labelElem.classList.add('selected');

    updateProgress();
}

/**
 * فحص وتعيين الـ selected عند التحميل إن وُجدت اختيارات محفوظة
 */
function initializeSelectedStates() {
    document.querySelectorAll('.likert-option input[type="radio"]:checked').forEach(radio => {
        const parent = radio.closest('.likert-option');
        if (parent) parent.classList.add('selected');
    });

    document.querySelectorAll('.option-card input:checked').forEach(input => {
        const parent = input.closest('.option-card');
        if (parent) parent.classList.add('selected');
    });
}

/**
 * التنقل بالخطوات (في نمط المعالج Wizard)
 */
function changeStep(delta) {
    const nextStep = currentStep + delta;

    if (delta > 0) {
        // التحقق من الحقول الإجبارية للخطوة الحالية قبل الانتقال للأمام
        if (!validateCurrentStep(currentStep)) {
            return;
        }
    }

    if (nextStep >= 1 && nextStep <= totalSteps) {
        currentStep = nextStep;
        showStep(currentStep);
    }
}

/**
 * إظهار خطوة محددة في وضع المعالج
 */
function showStep(stepNum) {
    document.querySelectorAll('.step-content').forEach((section, idx) => {
        if (idx + 1 === stepNum) {
            section.classList.add('active');
        } else {
            section.classList.remove('active');
        }
    });

    updateTabsState(stepNum);

    // تحديث أزرار التنقل
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');

    if (prevBtn) prevBtn.disabled = (stepNum === 1);

    if (nextBtn) {
        if (stepNum === totalSteps) {
            nextBtn.innerHTML = '💾 إرسال الاستبيان ✓';
            nextBtn.onclick = function() {
                document.getElementById('surveyForm').requestSubmit();
            };
        } else {
            nextBtn.innerHTML = 'التالي <span>&rarr;</span>';
            nextBtn.onclick = function() {
                changeStep(1);
            };
        }
    }

    // التمرير لأعلى النموذج
    const form = document.getElementById('surveyForm');
    if (form) {
        window.scrollTo({ top: form.offsetTop - 50, behavior: 'smooth' });
    }
}

/**
 * التحقق من تعبئة الحقول المطلوبة للخطوة الحالية
 */
function validateCurrentStep(stepNum) {
    const currentSection = document.getElementById(`step${stepNum}`);
    if (!currentSection) return true;

    const requiredInputs = currentSection.querySelectorAll('input[required]');
    const checkedRadioNames = new Set();
    let isValid = true;
    let firstInvalid = null;

    requiredInputs.forEach(input => {
        if (input.type === 'radio') {
            if (!checkedRadioNames.has(input.name)) {
                checkedRadioNames.add(input.name);
                const isRadioChecked = currentSection.querySelector(`input[name="${input.name}"]:checked`);
                if (!isRadioChecked) {
                    isValid = false;
                    if (!firstInvalid) firstInvalid = input;
                }
            }
        } else if (input.type === 'text') {
            if (!input.value.trim()) {
                isValid = false;
                if (!firstInvalid) firstInvalid = input;
            }
        }
    });

    if (!isValid) {
        alert('يرجى التكرم بالإجابة على جميع الأسئلة المطلوبة في هذا القسم قبل المتابعة.');
        if (firstInvalid) {
            firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (firstInvalid.focus) firstInvalid.focus();
        }
        return false;
    }

    return true;
}

/**
 * حساب وتحديث شريط التقدم بنسبة مئوية دقيقة
 */
function updateProgress() {
    const form = document.getElementById('surveyForm');
    if (!form) return;

    // مجموع الأسئلة الأساسية المطلوبة:
    // الديموغرافية: 4 (الوحدة الإدارية، المهنة، العمر، التعليم)
    // المحور الأول: 10
    // المحور الثاني: 5
    // المحور الثالث: 5
    // المحور الرابع: 10
    // المجموع = 34 سؤال مطلوب
    const totalRequiredQuestions = 34;

    let answeredCount = 0;

    // فحص الوحدة الإدارية
    const adminUnit = document.getElementById('adminUnit');
    if (adminUnit && adminUnit.value.trim().length > 0) answeredCount++;

    // فحص المهنة، العمر، المستوى التعليمي
    ['occupation', 'age', 'education'].forEach(name => {
        if (form.querySelector(`input[name="${name}"]:checked`)) answeredCount++;
    });

    // فحص أسئلة المحور الأول (1-10)
    for (let i = 1; i <= 10; i++) {
        if (form.querySelector(`input[name="axis1_q${i}"]:checked`)) answeredCount++;
    }

    // فحص أسئلة المحور الثاني (1-5)
    for (let i = 1; i <= 5; i++) {
        if (form.querySelector(`input[name="axis2_q${i}"]:checked`)) answeredCount++;
    }

    // فحص أسئلة المحور الثالث (1-5)
    for (let i = 1; i <= 5; i++) {
        if (form.querySelector(`input[name="axis3_q${i}"]:checked`)) answeredCount++;
    }

    // فحص أسئلة المحور الرابع (1-10)
    for (let i = 1; i <= 10; i++) {
        if (form.querySelector(`input[name="axis4_q${i}"]:checked`)) answeredCount++;
    }

    const percentage = Math.min(100, Math.round((answeredCount / totalRequiredQuestions) * 100));

    const progressBar = document.getElementById('progressBar');
    const percentIndicator = document.getElementById('percentIndicator');
    const stepIndicator = document.getElementById('stepIndicator');

    if (progressBar) progressBar.style.width = `${percentage}%`;
    if (percentIndicator) percentIndicator.textContent = `${percentage}%`;
    if (stepIndicator) {
        stepIndicator.textContent = `تمت الإجابة على ${answeredCount} من أصل ${totalRequiredQuestions} عبارة`;
    }
}

/**
 * إرسال ومعالجة الاستبيان
 */
async function submitForm(event) {
    if (event) event.preventDefault();

    const form = document.getElementById('surveyForm');
    if (!form) return;

    // جمع بيانات النموذج بالكامل
    const formData = new FormData(form);
    const dataObj = {};
    for (let [key, val] of formData.entries()) {
        dataObj[key] = val;
    }

    dataObj['submitted_at'] = new Date().toISOString();
    dataObj['submission_id'] = 'resp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

    // تغيير نص زر الإرسال لإظهار جاري الحفظ
    const submitBtns = document.querySelectorAll('button[type="submit"]');
    submitBtns.forEach(btn => {
        btn.disabled = true;
        btn.textContent = '⏳ جارٍ حفظ البيانات...';
    });

    try {
        // إرسال البيانات لسيرفر الـ API
        const response = await fetch('/api/responses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataObj)
        });

        if (!response.ok) {
            throw new Error('Server response error');
        }
        console.log('✅ تم إرسال الاستجابة بنجاح إلى السيرفر');
    } catch (err) {
        console.warn('⚠️ تعذر الاتصال بالسيرفر، سيتم حفظ الاستجابة محلياً في المتصفح.');
        try {
            const localList = JSON.parse(localStorage.getItem('survey_responses') || '[]');
            localList.push(dataObj);
            localStorage.setItem('survey_responses', JSON.stringify(localList));
        } catch (e) {
            console.error('Local storage error:', e);
        }
    }

    // إخفاء النموذج وإظهار شاشة النجاح
    form.style.display = 'none';
    const progressCont = document.querySelector('.progress-container');
    if (progressCont) progressCont.style.display = 'none';
    const tabsCont = document.querySelector('.survey-tabs-container');
    if (tabsCont) tabsCont.style.display = 'none';
    const viewModeBar = document.querySelector('.view-mode-bar');
    if (viewModeBar) viewModeBar.style.display = 'none';

    const successCard = document.getElementById('successState');
    if (successCard) {
        successCard.style.display = 'block';
        successCard.scrollIntoView({ behavior: 'smooth' });
    }
}

/**
 * إعادة تعيين الاستبيان لإدخال استجابة جديدة
 */
function resetSurvey() {
    const form = document.getElementById('surveyForm');
    if (form) {
        form.reset();
        form.style.display = 'block';
    }

    document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));

    const progressCont = document.querySelector('.progress-container');
    if (progressCont) progressCont.style.display = 'block';
    const tabsCont = document.querySelector('.survey-tabs-container');
    if (tabsCont) tabsCont.style.display = 'block';
    const viewModeBar = document.querySelector('.view-mode-bar');
    if (viewModeBar) viewModeBar.style.display = 'flex';

    const successCard = document.getElementById('successState');
    if (successCard) successCard.style.display = 'none';

    const submitBtns = document.querySelectorAll('button[type="submit"]');
    submitBtns.forEach(btn => {
        btn.disabled = false;
        btn.innerHTML = '<span>💾 إرسال وحفظ الاستبيان بالكامل</span>';
    });

    currentStep = 1;
    setViewMode(currentViewMode);
    updateProgress();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
