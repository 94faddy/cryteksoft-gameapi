$(document).ready(function() {

    // --- ส่วนจัดการหน้า Dashboard ---
    if ($('#users-summary-table').length) {
        
        // START: เพิ่มโค้ดส่วนที่หายไป
        const startDatepicker = $('#startDate').datepicker({
            uiLibrary: 'bootstrap5',
            format: 'mm/dd/yyyy'
        });
        const endDatepicker = $('#endDate').datepicker({
            uiLibrary: 'bootstrap5',
            format: 'mm/dd/yyyy'
        });
        // END: เพิ่มโค้ดส่วนที่หายไป

        const loadSummary = (start = '', end = '') => { // เปลี่ยนมาใช้ Arrow function เพื่อความสอดคล้อง
            let url = '/admin/api/dashboard-summary';
            if (start && end) {
                url += `?start=${start}&end=${end}`;
            }

            $.get(url, function(data) {
                const overallBet = data.overall.total_bet_all || 0;
                const overallWin = data.overall.total_win_all || 0;
                $('#overall-bet').text(overallBet.toLocaleString('en-US', { minimumFractionDigits: 2 }));
                $('#overall-win').text(overallWin.toLocaleString('en-US', { minimumFractionDigits: 2 }));
                $('#overall-profit').text((overallWin - overallBet).toLocaleString('en-US', { minimumFractionDigits: 2 }));
                
                const tableBody = $('#users-summary-table');
                tableBody.empty();
                if (data.usersSummary && data.usersSummary.length > 0) {
                    data.usersSummary.forEach(user => {
                        const bet = user.allTotal[0] ? user.allTotal[0].total_bet_all : 0;
                        const win = user.allTotal[0] ? user.allTotal[0].total_win_all : 0;
                        const displayName = `${user.name} (${user.username})`;
                        tableBody.append(`<tr><td>${displayName}</td><td>${bet.toFixed(2)}</td><td>${win.toFixed(2)}</td><td>${(win - bet).toFixed(2)}</td></tr>`);
                    });
                } else {
                    tableBody.append('<tr><td colspan="4" class="text-center">ไม่พบข้อมูล</td></tr>');
                }
            });
        };

        // START: เพิ่มโค้ดส่วนที่หายไป
        // เมื่อกดปุ่มค้นหา
        $('#search-button').on('click', function() {
            const startDate = startDatepicker.value();
            const endDate = endDatepicker.value();
            if (startDate && endDate) {
                loadSummary(startDate, endDate);
            } else {
                Swal.fire('เกิดข้อผิดพลาด', 'กรุณาเลือกช่วงวันที่ให้ครบถ้วน', 'warning');
            }
        });
        // END: เพิ่มโค้ดส่วนที่หายไป

        loadSummary(); // โหลดข้อมูลครั้งแรก
    }

    // --- ส่วนจัดการหน้า Create User ---
    $('#createUserForm').on('submit', function(e) {
        e.preventDefault();
        const form = $(this);
        $.ajax({
            type: 'POST',
            url: form.attr('action'),
            data: form.serialize(),
            dataType: 'json',
            success: function(response) {
                Swal.fire({
                    icon: 'success',
                    title: response.message,
                    timer: 2000,
                    showConfirmButton: false,
                }).then(() => {
                    window.location.href = '/admin/manage-users';
                });
            },
            error: function(xhr) {
                const error = xhr.responseJSON;
                Swal.fire('เกิดข้อผิดพลาด!', error.message || 'ไม่สามารถสร้างผู้ใช้ได้', 'error');
            }
        });
    });

    // --- ส่วนจัดการหน้า Manage Users ---
    if ($('#editUserModal').length) {
        let editModal = new bootstrap.Modal(document.getElementById('editUserModal'));

        $('.edit-btn').on('click', function() {
            const data = $(this).data();
            $('#edit-userId').val(data.userId);
            $('#edit-name').val(data.userName);
            $('#edit-username').val(data.userUsername);
            $('#edit-ip').val(data.userIp);
            $('#edit-callback').val(data.userCallback);
            $('#edit-secret').val(data.userSecret);
            $('#edit-new_password, #edit-admin_password').val('');
        });

        $('#editUserForm').on('submit', function(e) {
            e.preventDefault();
            const form = $(this);
            $.ajax({
                type: 'POST',
                url: form.attr('action'),
                data: form.serialize(),
                dataType: 'json',
                success: function(response) {
                    editModal.hide();
                    Swal.fire({
                        icon: 'success',
                        title: response.message,
                    }).then(() => location.reload());
                },
                error: function(xhr) {
                    const error = xhr.responseJSON;
                    Swal.fire('เกิดข้อผิดพลาด!', error.message || 'ไม่สามารถอัปเดตได้', 'error');
                }
            });
        });

        $('.delete-btn').on('click', function() {
            const userId = $(this).data('user-id');
            const userName = $(this).data('user-name');
            Swal.fire({
                title: `ยืนยันการลบ`,
                html: `คุณต้องการลบผู้ใช้งาน <b>${userName}</b> ใช่หรือไม่?`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                cancelButtonText: 'ยกเลิก',
                confirmButtonText: 'ใช่, ลบเลย',
                input: 'password',
                inputLabel: 'เพื่อยืนยัน, กรุณากรอกรหัสผ่าน Admin',
                inputPlaceholder: 'รหัสผ่าน Admin ของคุณ',
                inputValidator: (value) => {
                    if (!value) {
                        return 'กรุณากรอกรหัสผ่าน!'
                    }
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    $.ajax({
                        type: 'POST',
                        url: '/admin/api/delete-user',
                        data: { userId: userId, admin_password: result.value },
                        dataType: 'json'
                    }).done(function(response) {
                        Swal.fire('สำเร็จ!', response.message, 'success').then(() => location.reload());
                    }).fail(function(xhr) {
                        const error = xhr.responseJSON;
                        Swal.fire('เกิดข้อผิดพลาด!', error.message || 'ไม่สามารถลบได้', 'error');
                    });
                }
            });
        });
    }
});