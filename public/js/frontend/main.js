$(document).ready(function() {
    function formatNumber(num) {
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function loadOverallTotals() {
        $.ajax({
            url: '/api/user/totals',
            type: 'GET',
            success: function(data) {
                if (data.totals) {
                    const totalBet = data.totals.total_bet || 0;
                    const totalWin = data.totals.total_win || 0; 
                    const agentNet = totalBet - totalWin;

                    $('#total_bet_all').text(formatNumber(totalBet));
                    
                    $('#total_agent_loss').text(formatNumber(-totalWin));
                    
                    // ส่วนนี้จะกำหนดสีให้การ์ด "ยอดเสีย" เป็นสีแดงเสมอ
                    $('#total_agent_loss').closest('.card').css('background-color', 'rgba(255, 99, 132, 1) !important');
                    
                    const netProfitElement = $('#agent_net_profit');
                    netProfitElement.text(formatNumber(agentNet));

                    const netCard = $('#net_profit_card');
                    
                    // และส่วนนี้จะกำหนดสีให้การ์ด "ยอดได้" ตามผลกำไร/ขาดทุน
                    if (agentNet >= 0) {
                        netCard.css('background-color', 'rgba(75, 192, 192, 1) !important');
                    } else {
                        netCard.css('background-color', 'rgba(255, 99, 132, 1) !important');
                    }
                }
            },
            error: function(err) {
                console.error("Could not load totals", err);
            }
        });
    }

    function loadChartData() {
        // --- START: เพิ่มโค้ดตรวจสอบ element ---
        const canvasElement = document.getElementById('monthlyChart');
        // ถ้าในหน้านั้นไม่มี element ของกราฟ ให้หยุดการทำงานของฟังก์ชันนี้ทันที
        if (!canvasElement) {
            return;
        }
        // --- END: เพิ่มโค้ดตรวจสอบ element ---

        $.ajax({
            url: '/api/user/monthly-summary',
            type: 'GET',
            success: function(data) {
                const labels = [];
                const betData = [];
                const lossData = [];
                const profitData = [];
                const monthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

                data.forEach(item => {
                    const [year, month] = item.month.split('-');
                    labels.push(`${monthNames[parseInt(month) - 1]} ${year}`);
                    betData.push(item.totalBet);
                    lossData.push(item.totalWin);
                    profitData.push(item.profit);
                });

                // ใช้ canvasElement ที่เราหาไว้แล้ว
                const ctx = canvasElement.getContext('2d');
                new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'ยอดเดิมพันทั้งหมด',
                            data: betData,
                            backgroundColor: 'rgba(54, 162, 235, 0.7)'
                        }, {
                            label: 'ยอดเสียทั้งหมด (Agent เสีย)',
                            data: lossData,
                            backgroundColor: 'rgba(255, 99, 132, 0.7)'
                        }, {
                            label: 'ยอดได้ทั้งหมด (Agent ได้)',
                            data: profitData,
                            backgroundColor: 'rgba(75, 192, 192, 0.7)'
                        }]
                    },
                    options: {
                        responsive: true,
                        scales: { y: { ticks: { color: '#fff' } }, x: { ticks: { color: '#fff' } } },
                        plugins: { legend: { labels: { color: '#fff' } } }
                    }
                });
            },
            error: function(err) {
                console.error("Could not load chart data", err);
            }
        });
    }

    loadOverallTotals();
    loadChartData();

    // --- ส่วนจัดการหน้า Change Password ---
    $('#changePasswordForm').on('submit', function(e) {
        e.preventDefault();
        const form = $(this);
        $.ajax({
            type: 'POST',
            url: form.attr('action'),
            data: form.serialize(),
            dataType: 'json',
            success: function(response) {
                Swal.fire('สำเร็จ!', response.message, 'success');
                form[0].reset();
            },
            error: function(xhr) {
                const error = xhr.responseJSON;
                Swal.fire('เกิดข้อผิดพลาด!', error.message || 'ไม่สามารถเปลี่ยนรหัสผ่านได้', 'error');
            }
        });
    });

    // --- ส่วนจัดการหน้า API Keys ---
    $('#updateApiInfoForm').on('submit', function(e) {
        e.preventDefault();
        const form = $(this);
        $.ajax({
            type: 'POST',
            url: form.attr('action'),
            data: form.serialize(),
            dataType: 'json',
            success: function(response) {
                Swal.fire('สำเร็จ!', response.message, 'success');
                $('#currentPassword').val('');
            },
            error: function(xhr) {
                const error = xhr.responseJSON;
                Swal.fire('เกิดข้อผิดพลาด!', error.message || 'ไม่สามารถอัปเดตข้อมูลได้', 'error');
            }
        });
    });

    // เปิดใช้งานปุ่มคัดลอก
    new ClipboardJS('.btn-copy').on('success', function(e) {
        const originalText = $(e.trigger).text();
        $(e.trigger).text('คัดลอกแล้ว!');
        setTimeout(() => { $(e.trigger).text(originalText); }, 2000);
        e.clearSelection();
    });


    // --- ส่วนจัดการหน้า Setup 2FA ---
    $('#verify2faForm').on('submit', function(e) {
        e.preventDefault();
        const form = $(this);
        $.ajax({
            type: 'POST',
            url: form.attr('action'),
            data: form.serialize(),
            dataType: 'json',
            success: function(response) {
                Swal.fire('สำเร็จ!', response.message, 'success')
                .then(() => window.location.href = '/manage-2fa');
            },
            error: function(xhr) {
                Swal.fire('เกิดข้อผิดพลาด!', xhr.responseJSON.message, 'error');
            }
        });
    });

    // --- ส่วนจัดการหน้า Disable 2FA ---
    $('#disable2faForm').on('submit', function(e) {
        e.preventDefault();
        const form = $(this);
        $.ajax({
            type: 'POST',
            url: form.attr('action'),
            data: form.serialize(),
            dataType: 'json',
            success: function(response) {
                Swal.fire('สำเร็จ!', response.message, 'success')
                .then(() => location.reload());
            },
            error: function(xhr) {
                Swal.fire('เกิดข้อผิดพลาด!', xhr.responseJSON.message, 'error');
            }
        });
    });

});